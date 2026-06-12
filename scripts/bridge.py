#!/usr/bin/env python3
"""
AI Road Trip Planner - File Bridge Script
Monitors JSONL files and calls AI backend to generate responses.
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
SYSTEM_PROMPT_PATH = Path("src/prompts/v1/role.txt")
TIMEOUT_HOURS = 4


class JSONLHandler(FileSystemEventHandler):
    def __init__(self):
        self.processing = set()

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

    def call_ai(self, file_path: Path, user_message: dict) -> dict | None:
        provider = user_message.get("provider", "mimo")
        text = user_message.get("text", "")

        system_prompt = SYSTEM_PROMPT_PATH.read_text()

        if provider == "mimo":
            return self.call_mimo(file_path.stem, text, system_prompt)

        print(f"Unknown provider: {provider}")
        return None

    def call_mimo(self, session_id: str, user_message: str, system_prompt: str) -> dict | None:
        try:
            # 简化调用：直接用 mimo run + 模型参数
            cmd = [
                "mimo", "run",
                "-m", "mimo/mimo-auto",
                "--dangerously-skip-permissions",
                user_message
            ]
            
            print(f"Calling MiMo...", flush=True)
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                print(f"Mimo error: {result.stderr}", flush=True)
                return None

            print(f"MiMo response received", flush=True)
            return self.parse_ai_response(result.stdout)

        except subprocess.TimeoutExpired:
            print("Mimo call timed out", flush=True)
            return None
        except FileNotFoundError:
            print("Mimo CLI not found", flush=True)
            return None

    def parse_ai_response(self, response: str) -> dict | None:
        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1

            if json_start == -1 or json_end == 0:
                return {"text": response, "envelope": {}}

            json_str = response[json_start:json_end]
            envelope = json.loads(json_str)

            return {
                "text": envelope.get("chat", response),
                "envelope": envelope,
            }

        except json.JSONDecodeError:
            return {"text": response, "envelope": {}}

    def append_response(self, file_path: Path, response: dict):
        message = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "role": "ai",
            "text": response.get("text", ""),
            "envelope": response.get("envelope", {}),
            "provider": "mimo",
        }

        with open(file_path, "a") as f:
            f.write(json.dumps(message, ensure_ascii=False) + "\n")

    def archive_session(self, file_path: Path):
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        archive_name = f"{timestamp}.jsonl"
        archive_path = ARCHIVE_DIR / archive_name

        file_path.rename(archive_path)
        print(f"Archived session: {file_path.name} -> {archive_name}")


def check_timeouts():
    """Check for sessions that haven't been updated in TIMEOUT_HOURS."""
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
    print(f"Sessions directory: {SESSIONS_DIR.absolute()}")
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
