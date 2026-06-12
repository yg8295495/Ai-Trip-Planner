---
feature: ai-trip-planner-file-bridge
status: delivered
specs:
  - docs/compose/specs/2026-06-12-ai-trip-planner-design.md
plans:
  - docs/compose/plans/2026-06-12-file-bridge-architecture.md
branch: master
commits: c57b922..bdb83fc
---

# AI Road Trip Planner — File Bridge Architecture Final Report

## What Was Built

Replaced direct AI API calls with a file-based bridge architecture. The frontend writes user messages to JSONL files, a Python script monitors the files and calls AI backends (currently MiMo CLI), and responses are written back to files. The frontend polls for new responses only when waiting for AI.

**Key components:**
- JSONL utility functions for reading/writing conversation files
- Session manager composable for session lifecycle
- AI response poller with timeout handling
- Python bridge script with watchdog file monitoring
- API server for frontend file operations

## Architecture

```
Browser (Vue)
    ↓ writes user message to JSONL
/shared/sessions/active/session-xxx.jsonl
    ↑ Python script monitors file
    ↓ calls AI CLI/API
AI Response written to JSONL
    ↑ Frontend polls every 1s
Browser renders AI response
```

**New files:**
```
src/
  utils/jsonl.ts           — JSONL read/write utilities
  composables/
    useSession.ts          — Session lifecycle management
    usePolling.ts          — AI response polling with timeout
    useAI.ts               — Updated to use file bridge

scripts/
  bridge.py                — Python file monitor + AI caller
  server.py                — API server for file operations
  requirements.txt         — Python dependencies (watchdog)
```

**Session management:**
- `/sessions/active/` — Current sessions
- `/sessions/archive/` — Archived sessions (4h timeout or manual close)
- JSONL format: user/ai/system messages with timestamps

### Design Decisions

- **JSONL over JSON:** Line-based format allows appending without loading entire file. Each line is a complete message.
- **Polling over WebSocket:** Simpler implementation, sufficient for single-user personal tool. Only polls when waiting for AI response.
- **Python watchdog:** Reliable file system monitoring, handles concurrent writes.
- **MiMo CLI as default:** Zero API cost, uses agent's free quota.

## Usage

```bash
# Start API server
cd scripts
python server.py &

# Start Python bridge (monitors files, calls AI)
python bridge.py &

# Start frontend
npm run dev
```

**Workflow:**
1. Open browser at localhost:5173
2. Type message in chat
3. Frontend writes to JSONL
4. Python script detects change, calls MiMo
5. Response written to JSONL
6. Frontend polls, detects response, renders

## Verification

- ✅ `npx vue-tsc --noEmit` — No TypeScript errors
- ✅ `npm run build` — Production build succeeds (84.38 KB JS)
- ✅ JSONL utilities handle read/write/append
- ✅ Polling stops on AI response or timeout
- ✅ Session lifecycle (create/load/close/archive) works

## Journey Log

- [lesson] File-based architecture eliminates API key exposure from frontend completely.
- [lesson] Polling only when waiting for AI response keeps resource usage minimal.
- [lesson] JSONL format is ideal for append-only conversation logs.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-06-12-file-bridge-architecture.md` | Implementation plan | 8 tasks, all completed |
| User's architecture document | Design input | File Bridge Architecture §1-8 |
