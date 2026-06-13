#!/usr/bin/env python3
"""
AI Road Trip Planner - API Server
Provides HTTP endpoints for frontend to read/write JSONL files.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import time
from urllib.parse import urlparse, parse_qs


class JSONLHandler(BaseHTTPRequestHandler):
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
        sessions_dir = "sessions/active"
        sessions = []
        current_time = time.time()
        four_hours = 4 * 60 * 60  # 4小时 = 14400秒

        if os.path.exists(sessions_dir):
            for f in os.listdir(sessions_dir):
                if f.endswith(".jsonl"):
                    file_path = os.path.join(sessions_dir, f)
                    stat = os.stat(file_path)
                    # 检查是否超过4小时未更新
                    if current_time - stat.st_mtime > four_hours:
                        continue  # 跳过过期会话
                    with open(file_path, "r") as fh:
                        line_count = sum(1 for _ in fh)
                    sessions.append({
                        "id": f.replace(".jsonl", ""),
                        "filePath": file_path,
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


def main():
    server = HTTPServer(("localhost", 3001), JSONLHandler)
    print("API server running on http://localhost:3001")
    server.serve_forever()


if __name__ == "__main__":
    main()
