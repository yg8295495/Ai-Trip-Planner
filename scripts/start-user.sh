#!/bin/bash
# ============================================================
# start-user.sh - 用户自主执行
# 后端静默后台 + 前端前台可见
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# ---- 清理端口 (只杀特定进程) ----
kill_port() {
    local port=$1
    pkill -f "uvicorn main:app.*$port" 2>/dev/null
    pkill -f "node.*vite.*$port" 2>/dev/null
    local pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null
    sleep 1
    echo -e "${GREEN}✓ 端口 $port 已清理${NC}"
}

echo -e "${BLUE}=== 随心自驾 - 用户启动 ===${NC}"
kill_port 3001
kill_port 443
kill_port 80

# ---- 后端: 静默后台 ----
echo -e "${BLUE}[1/2] 启动后端 FastAPI (3001)...${NC}"
cd "$ROOT_DIR/backend"
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$ROOT_DIR"
sleep 2

if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ 后端已启动 PID=$BACKEND_PID → $LOG_DIR/backend.log${NC}"
else
    echo -e "${RED}✗ 后端启动失败${NC}"; tail -10 "$LOG_DIR/backend.log"; exit 1
fi

# ---- 前端: 前台 + 日志 ----
echo -e "${BLUE}[2/2] 启动前端 Vite (443 HTTPS)...${NC}"
echo -e "${GREEN}访问: https://localhost:443${NC}"
echo -e "${YELLOW}Ctrl+C 停止所有服务${NC}"
echo ""

> "$LOG_DIR/frontend.log"
npm run dev 2>&1 | tee "$LOG_DIR/frontend.log"

# ---- Ctrl+C 后清理 ----
echo -e "\n${YELLOW}停止服务...${NC}"
kill -0 $BACKEND_PID 2>/dev/null && kill $BACKEND_PID 2>/dev/null
kill_port 3001; kill_port 443; kill_port 80
echo -e "${GREEN}✓ 已停止${NC}"
