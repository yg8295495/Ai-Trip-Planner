#!/bin/bash
# 开发环境启动脚本
# 自动 kill 占用 3001 端口的旧 server 进程，然后启动 FastAPI 后端

# 查找并 kill 占用 3001 端口的进程
PID=$(lsof -ti:3001)
if [ -n "$PID" ]; then
  echo "Killing old server process (PID: $PID)..."
  kill -9 $PID 2>/dev/null
  sleep 1
fi

# 启动 FastAPI 后端（后台运行）
echo "Starting FastAPI server on port 3001..."
cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload &
BACKEND_PID=$!

# 确保退出时 kill backend
trap "kill $BACKEND_PID 2>/dev/null" EXIT

# 启动 Vite dev server
echo "Starting Vite dev server on port 443 (HTTPS)..."
npm run dev
