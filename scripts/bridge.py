#!/usr/bin/env python3
"""
AI Road Trip Planner - Unified Bridge Script
Combines HTTP API server + file watcher + AI caller in one process.
"""

import os
import json
import time
import subprocess
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

SESSIONS_DIR = Path("sessions/active")
ARCHIVE_DIR = Path("sessions/archive")
SYSTEM_PROMPT_PATH = Path("src/prompts/v1/role.txt")
TIMEOUT_HOURS = 4
API_PORT = 3001


# ── HTTP API Server ──────────────────────────────────────────────

class APIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/last-line":
            self.handle_last_line(parsed)
        elif parsed.path == "/api/read":
            self.handle_read(parsed)
        elif parsed.path == "/api/sessions/active":
            self.handle_list_sessions()
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/append":
            self.handle_append()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def handle_last_line(self, parsed):
        params = parse_qs(parsed.query)
        file_path = params.get("path", [None])[0]

        if not file_path or not os.path.exists(file_path):
            self.send_json({"line": None})
            return

        try:
            with open(file_path, "r") as f:
                lines = f.read().strip().split("\n")
                last_line = lines[-1] if lines else None
            self.send_json({"line": last_line})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_read(self, parsed):
        params = parse_qs(parsed.query)
        file_path = params.get("path", [None])[0]

        if not file_path or not os.path.exists(file_path):
            self.send_json({"lines": []})
            return

        try:
            with open(file_path, "r") as f:
                lines = f.read().strip().split("\n")
            self.send_json({"lines": lines})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_list_sessions(self):
        sessions = []

        if SESSIONS_DIR.exists():
            for f in SESSIONS_DIR.glob("*.jsonl"):
                stat = f.stat()
                with open(f, "r") as fh:
                    line_count = sum(1 for _ in fh)
                sessions.append({
                    "id": f.stem,
                    "filePath": str(f),
                    "lastModified": stat.st_mtime,
                    "messageCount": line_count,
                })

        self.send_json(sessions)

    def handle_append(self):
        content_length = int(self.headers["Content-Length"])
        body = json.loads(self.rfile.read(content_length))

        file_path = body.get("filePath")
        line = body.get("line")

        if not file_path or not line:
            self.send_json({"error": "Missing filePath or line"}, 400)
            return

        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "a") as f:
                f.write(line)
            self.send_json({"success": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def log_message(self, format, *args):
        pass  # Suppress default HTTP logs


def start_api_server():
    server = HTTPServer(("localhost", API_PORT), APIHandler)
    print(f"API server running on http://localhost:{API_PORT}")
    server.serve_forever()


# ── File Watcher + AI Caller ─────────────────────────────────────

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
            full_prompt = f"{system_prompt}\n\n用户消息：{user_message}"
            result = subprocess.run(
                ["mimo", "run", "--session", session_id, "--dangerously-skip-permissions", full_prompt],
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                print(f"Mimo error: {result.stderr}")
                return None

            return self.parse_ai_response(result.stdout)

        except subprocess.TimeoutExpired:
            print("Mimo call timed out")
            return None
        except FileNotFoundError:
            print("Mimo CLI not found. Install MiMo Code first.")
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


def start_file_watcher():
    handler = JSONLHandler()
    observer = Observer()
    observer.schedule(handler, str(SESSIONS_DIR), recursive=False)
    observer.start()

    print(f"Monitoring {SESSIONS_DIR} for JSONL changes...")

    timeout_thread = threading.Thread(target=check_timeouts, daemon=True)
    timeout_thread.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


# ── Main ─────────────────────────────────────────────────────────

def main():
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 50)
    print("AI Road Trip Planner - File Bridge")
    print("=" * 50)
    print(f"Sessions directory: {SESSIONS_DIR.absolute()}")
    print(f"API endpoint: http://localhost:{API_PORT}")
    print("=" * 50)

    api_thread = threading.Thread(target=start_api_server, daemon=True)
    api_thread.start()

    start_file_watcher()


if __name__ == "__main__":
    main()
