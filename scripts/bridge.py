#!/usr/bin/env python3
"""
AI Road Trip Planner - File Bridge Script
Monitors JSONL files and calls AI backend to generate responses.
Default provider: CodeBuddy
"""

import os
import json
import time
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

SESSIONS_DIR = Path("sessions/active")
ARCHIVE_DIR = Path("sessions/archive")
SYSTEM_PROMPT_PATH = Path("src/prompts/system.txt")
TIMEOUT_HOURS = 4
SYSTEM_PROMPT_INTERVAL = 10


class JSONLHandler(FileSystemEventHandler):
    def __init__(self):
        self.processing = set()
        self.turn_counters: dict[str, int] = {}

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

    def get_turn_count(self, file_path: Path) -> int:
        key = str(file_path)
        if key not in self.turn_counters:
            self.turn_counters[key] = 0
        return self.turn_counters[key]

    def increment_turn(self, file_path: Path):
        key = str(file_path)
        self.turn_counters[key] = self.get_turn_count(file_path) + 1

    def call_ai(self, file_path: Path, user_message: dict) -> dict | None:
        provider = user_message.get("provider", "codebuddy")
        text = user_message.get("text", "")

        turn = self.get_turn_count(file_path)
        inject_system = (turn == 0) or (turn % SYSTEM_PROMPT_INTERVAL == 0)

        if inject_system:
            system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
            if turn == 0:
                full_message = f"{system_prompt}\n\n用户消息：{text}"
            else:
                full_message = f"{system_prompt}\n\n用户消息：{text}"
        else:
            full_message = text

        self.increment_turn(file_path)
        turn = self.get_turn_count(file_path)

        if provider == "codebuddy":
            return self.call_codebuddy(full_message, turn)
        elif provider == "mimo":
            return self.call_mimo(full_message, turn)
        else:
            print(f"Unknown provider: {provider}")
            return None

    def call_codebuddy(self, user_message: str, turn: int) -> dict | None:
        try:
            cmd = ["codebuddy", "-p", user_message, "-c"]

            print(f"[CodeBuddy] Turn {turn}", flush=True)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                print(f"[CodeBuddy] Error, falling back to MiMo", flush=True)
                return self.call_mimo(user_message, turn)

            print(f"[CodeBuddy] Response ({len(result.stdout)} chars)", flush=True)
            return self.parse_response(result.stdout)

        except subprocess.TimeoutExpired:
            print("[CodeBuddy] Timeout, falling back to MiMo", flush=True)
            return self.call_mimo(user_message, turn)
        except FileNotFoundError:
            print("[CodeBuddy] Not found, falling back to MiMo", flush=True)
            return self.call_mimo(user_message, turn)

    def call_mimo(self, user_message: str, turn: int) -> dict | None:
        try:
            cmd = ["mimo", "run", "-m", "mimo/mimo-auto", "--dangerously-skip-permissions", "-c", user_message]

            print(f"[MiMo] Turn {turn}", flush=True)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=180
            )

            if result.returncode != 0:
                print(f"[MiMo] Error: {result.stderr}", flush=True)
                return None

            print(f"[MiMo] Response ({len(result.stdout)} chars)", flush=True)
            return self.parse_response(result.stdout)

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

    def parse_response(self, response: str) -> dict:
        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1

            if json_start == -1 or json_end == 0:
                return {
                    "chat": response.strip(),
                    "status": "unknown",
                    "tripParamUpdates": {},
                    "locationUpdates": [],
                    "itineraryNotes": "",
                    "missingFields": []
                }

            envelope = json.loads(response[json_start:json_end])
            return {"text": envelope.get("chat", response), "envelope": envelope}

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
        provider = "codebuddy"
        message = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "role": "ai",
            "text": response.get("text", ""),
            "envelope": response.get("envelope", {}),
            "provider": provider,
        }
        with open(file_path, "a") as f:
            f.write(json.dumps(message, ensure_ascii=False) + "\n")

    def archive_session(self, file_path: Path):
        key = str(file_path)
        if key in self.turn_counters:
            del self.turn_counters[key]

        timestamp = time.strftime("%Y%m%d-%H%M%S")
        archive_path = ARCHIVE_DIR / f"{timestamp}.jsonl"
        file_path.rename(archive_path)
        print(f"Archived: {file_path.name}")


def check_timeouts():
    while True:
        time.sleep(60)
        now = time.time()
        for file_path in SESSIONS_DIR.glob("*.jsonl"):
            if (now - file_path.stat().st_mtime) / 3600 > TIMEOUT_HOURS:
                try:
                    lines = file_path.read_text().strip().split("\n")
                    last_line = json.loads(lines[-1]) if lines else {}
                    if last_line.get("event") != "session_closed":
                        with open(file_path, "a") as f:
                            f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "role": "system", "event": "auto_archived"}, ensure_ascii=False) + "\n")
                        archive_path = ARCHIVE_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
                        file_path.rename(archive_path)
                        print(f"Auto-archived: {file_path.name}")
                except Exception as e:
                    print(f"Timeout check error: {e}")


def main():
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 50)
    print("AI Road Trip Planner - File Bridge")
    print("=" * 50)
    print(f"Provider: codebuddy (fallback: mimo)")
    print(f"Sessions: {SESSIONS_DIR.absolute()}")
    print(f"System prompt: every {SYSTEM_PROMPT_INTERVAL} turns")
    print("=" * 50)

    import threading
    threading.Thread(target=check_timeouts, daemon=True).start()

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
