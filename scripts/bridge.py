#!/usr/bin/env python3
"""
AI Road Trip Planner - File Bridge Script
Monitors JSONL files and calls AI backend to generate responses.
Default provider: CodeBuddy
"""

import os
import json
import time
import uuid
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

SESSIONS_DIR = Path("sessions/active")
ARCHIVE_DIR = Path("sessions/archive")
SYSTEM_PROMPT_PATH = Path("src/prompts/system.txt")
NEW_SESSION_PROMPT_PATH = Path("src/prompts/new_session.txt")
TIMEOUT_HOURS = 4
SYSTEM_PROMPT_INTERVAL = 10  # 每 10 轮重新注入 system prompt


class SessionState:
    """管理单个会话的状态"""
    def __init__(self):
        self.turn_count = 0
        self.session_id: str | None = None
        self.provider = "codebuddy"


class JSONLHandler(FileSystemEventHandler):
    def __init__(self):
        self.processing = set()
        self.sessions: dict[str, SessionState] = {}  # file_path -> SessionState

    def on_modified(self, event):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        if file_path.suffix != ".jsonl":
            return

        if file_path in self.processing:
            return

        self.processing.add(file_path)
        try:
            self.process_file(file_path)
        finally:
            self.processing.discard(file_path)

    def process_file(self, file_path: Path):
        try:
            lines = file_path.read_text().strip().split("\n")
            if not lines:
                return

            last_line = json.loads(lines[-1])

            if last_line.get("role") == "system":
                if last_line.get("event") == "session_closed":
                    self.archive_session(file_path)
                return

            if last_line.get("role") != "user":
                return

            ai_response = self.call_ai(file_path, last_line)
            if ai_response:
                self.append_response(file_path, ai_response)

        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    def get_session_state(self, file_path: Path) -> SessionState:
        """获取或创建会话状态"""
        key = str(file_path)
        if key not in self.sessions:
            self.sessions[key] = SessionState()
        return self.sessions[key]

    def call_ai(self, file_path: Path, user_message: dict) -> dict | None:
        session = self.get_session_state(file_path)
        provider = user_message.get("provider", "codebuddy")
        text = user_message.get("text", "")

        # 读取 prompt 文件
        system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
        new_session_prompt = NEW_SESSION_PROMPT_PATH.read_text(encoding="utf-8")

        # 判断是否需要注入 system prompt
        session.turn_count += 1
        inject_system = (session.turn_count == 1) or (session.turn_count % SYSTEM_PROMPT_INTERVAL == 0)

        # 首次调用时生成 session ID（CodeBuddy 使用 UUID）
        if session.session_id is None and provider == "codebuddy":
            session.session_id = str(uuid.uuid4())

        session.provider = provider

        # 拼接消息
        if inject_system:
            if session.turn_count == 1:
                # 首次：system prompt + new session prompt
                full_message = f"{system_prompt}\n\n{new_session_prompt}\n\n用户消息：{text}"
            else:
                # 每 10 轮：只注入 system prompt
                full_message = f"{system_prompt}\n\n用户消息：{text}"
        else:
            full_message = text

        # 调用 CLI
        if provider == "codebuddy":
            return self.call_codebuddy(file_path.stem, full_message, session)
        elif provider == "mimo":
            return self.call_mimo(file_path.stem, full_message, session)
        else:
            print(f"Unknown provider: {provider}")
            return None

    def call_codebuddy(self, session_id: str, user_message: str, session: SessionState) -> dict | None:
        """调用 CodeBuddy CLI"""
        try:
            cmd = ["codebuddy", "-p", user_message]

            if session.session_id:
                cmd += ["-r", session.session_id]
            else:
                cmd += ["-c"]

            print(f"[CodeBuddy] Turn {session.turn_count}, session={session.session_id or 'new'}", flush=True)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                print(f"CodeBuddy error: {result.stderr}", flush=True)
                # 回退到 MiMo
                print("Falling back to MiMo...", flush=True)
                return self.call_mimo(session_id, user_message, session)

            print(f"[CodeBuddy] Response received ({len(result.stdout)} chars)", flush=True)
            return self.parse_ai_response(result.stdout)

        except subprocess.TimeoutExpired:
            print("[CodeBuddy] Timeout, falling back to MiMo...", flush=True)
            return self.call_mimo(session_id, user_message, session)
        except FileNotFoundError:
            print("[CodeBuddy] Not found, falling back to MiMo...", flush=True)
            return self.call_mimo(session_id, user_message, session)

    def call_mimo(self, session_id: str, user_message: str, session: SessionState) -> dict | None:
        """调用 MiMo CLI"""
        try:
            cmd = ["mimo", "run", "-m", "mimo/mimo-auto", "--dangerously-skip-permissions", user_message]

            if session.session_id:
                cmd += ["--session", session.session_id, "-c"]

            print(f"[MiMo] Turn {session.turn_count}", flush=True)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=180
            )

            if result.returncode != 0:
                print(f"MiMo error: {result.stderr}", flush=True)
                return None

            print(f"[MiMo] Response received ({len(result.stdout)} chars)", flush=True)
            return self.parse_ai_response(result.stdout)

        except subprocess.TimeoutExpired:
            print("[MiMo] Timeout (180s)", flush=True)
            return {
                "chat": "AI 响应超时，请稍后重试。",
                "status": "error",
                "tripParamUpdates": {},
                "locationUpdates": [],
                "itineraryNotes": "",
                "missingFields": []
            }
        except FileNotFoundError:
            print("[MiMo] Not found", flush=True)
            return None

    def parse_ai_response(self, response: str) -> dict | None:
        """解析 AI 响应为 JSON 信封"""
        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1

            if json_start == -1 or json_end == 0:
                # 回退：整段文本当 chat 处理
                return {
                    "chat": response.strip(),
                    "status": "unknown",
                    "tripParamUpdates": {},
                    "locationUpdates": [],
                    "itineraryNotes": "",
                    "missingFields": []
                }

            json_str = response[json_start:json_end]
            envelope = json.loads(json_str)

            return {
                "text": envelope.get("chat", response),
                "envelope": envelope,
            }

        except json.JSONDecodeError:
            return {
                "chat": response.strip(),
                "status": "unknown",
                "tripParamUpdates": {},
                "locationUpdates": [],
                "itineraryNotes": "",
                "missingFields": []
            }

    def append_response(self, file_path: Path, response: dict):
        """追加 AI 响应到 JSONL 文件"""
        session = self.get_session_state(file_path)
        message = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "role": "ai",
            "text": response.get("text", ""),
            "envelope": response.get("envelope", {}),
            "provider": session.provider,
        }

        with open(file_path, "a") as f:
            f.write(json.dumps(message, ensure_ascii=False) + "\n")

    def archive_session(self, file_path: Path):
        """归档会话"""
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        archive_name = f"{timestamp}.jsonl"
        archive_path = ARCHIVE_DIR / archive_name

        # 清理会话状态
        key = str(file_path)
        if key in self.sessions:
            del self.sessions[key]

        file_path.rename(archive_path)
        print(f"Archived session: {file_path.name} -> {archive_name}")


def check_timeouts():
    """检查超时会话并归档"""
    while True:
        time.sleep(60)

        now = time.time()
        for file_path in SESSIONS_DIR.glob("*.jsonl"):
            mtime = file_path.stat().st_mtime
            age_hours = (now - mtime) / 3600

            if age_hours > TIMEOUT_HOURS:
                try:
                    lines = file_path.read_text().strip().split("\n")
                    last_line = json.loads(lines[-1]) if lines else {}

                    if last_line.get("event") != "session_closed":
                        timeout_msg = {
                            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
                            "role": "system",
                            "event": "auto_archived",
                        }
                        with open(file_path, "a") as f:
                            f.write(json.dumps(timeout_msg, ensure_ascii=False) + "\n")

                        timestamp = time.strftime("%Y%m%d-%H%M%S")
                        archive_path = ARCHIVE_DIR / f"{timestamp}.jsonl"
                        file_path.rename(archive_path)
                        print(f"Auto-archived timeout session: {file_path.name}")

                except Exception as e:
                    print(f"Error checking timeout for {file_path}: {e}")


def main():
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 50)
    print("AI Road Trip Planner - File Bridge")
    print("=" * 50)
    print(f"Default provider: codebuddy")
    print(f"Sessions directory: {SESSIONS_DIR.absolute()}")
    print(f"System prompt interval: every {SYSTEM_PROMPT_INTERVAL} turns")
    print("Waiting for JSONL changes...")
    print("=" * 50)

    import threading
    timeout_thread = threading.Thread(target=check_timeouts, daemon=True)
    timeout_thread.start()

    handler = JSONLHandler()
    observer = Observer()
    observer.schedule(handler, str(SESSIONS_DIR), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
