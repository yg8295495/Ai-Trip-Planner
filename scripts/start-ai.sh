#!/bin/bash
# ============================================================
# start-ai.sh - AI 调试用，前后端全部静默后台
# 重启时自动杀旧进程，日志写文件
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# ---- 清理旧进程 (只杀 uvicorn/node，不误杀) ----
kill_port() {
    local port=$1
    # 只杀 uvicorn 进程 (后端)
    pkill -f "uvicorn main:app.*$port" 2>/dev/null
    # 只杀 node 进程中的 vite (前端)
    pkill -f "node.*vite.*$port" 2>/dev/null
    # 兜底: 用 lsof 找进程，但只杀匹配的
    local pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null
    sleep 1
}

echo -e "${BLUE}[1/3] 清理旧进程...${NC}"
kill_port 3001
kill_port 443
kill_port 80
echo -e "${GREEN}✓ 端口已清理${NC}"

# ---- 后端: 静默后台 ----
echo -e "${BLUE}[2/3] 启动后端 (3001)...${NC}"
cd "$ROOT_DIR/backend"
> "$LOG_DIR/backend.log"
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$ROOT_DIR"
sleep 2

if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ 后端 PID=$BACKEND_PID${NC}"
else
    echo -e "${RED}✗ 后端失败${NC}"; tail -10 "$LOG_DIR/backend.log"; exit 1
fi

# ---- 前端: 静默后台 ----
echo -e "${BLUE}[3/3] 启动前端 (443)...${NC}"
cd "$ROOT_DIR"
> "$LOG_DIR/frontend.log"
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 5

if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ 前端 PID=$FRONTEND_PID${NC}"
else
    echo -e "${RED}✗ 前端失败${NC}"; tail -10 "$LOG_DIR/frontend.log"; exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  服务已启动${NC}"
echo -e "${GREEN}  后端: http://localhost:3001  PID=$BACKEND_PID${NC}"
echo -e "${GREEN}  前端: https://localhost:443  PID=$FRONTEND_PID${NC}"
echo -e "${GREEN}  日志: $LOG_DIR/backend.log${NC}"
echo -e "${GREEN}         $LOG_DIR/frontend.log${NC}"
echo -e "${GREEN}========================================${NC}"
