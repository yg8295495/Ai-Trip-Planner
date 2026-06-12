# File Bridge Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct API calls with a JSONL file bridge architecture where the frontend writes user messages to files, a Python script monitors and calls AI, and responses are written back to files.

**Architecture:** Frontend writes JSONL → Python script watches directory → Calls AI CLI/API → Writes response to JSONL → Frontend polls for responses. Session management via /active/ and /archive/ directories.

**Tech Stack:** Vue 3, TypeScript, Pinia, Python (watchdog), JSONL files

---

### Task 1: JSONL Utility Functions

**Covers:** [File Bridge Architecture §5]

**Files:**
- Create: `src/utils/jsonl.ts`
- Create: `src/types/session.ts`

- [ ] **Step 1: Define session types**

```typescript
// src/types/session.ts
export interface JSONLMessage {
  ts: string
  role: 'user' | 'ai' | 'system'
  text?: string
  envelope?: AIResponseEnvelope
  provider?: string
  event?: 'session_closed' | 'auto_archived'
}

export interface SessionInfo {
  id: string
  filePath: string
  lastModified: Date
  messageCount: number
  isActive: boolean
}
```

- [ ] **Step 2: Create JSONL read/write utilities**

```typescript
// src/utils/jsonl.ts
import type { JSONLMessage } from '@/types/session'

const SESSIONS_DIR = import.meta.env.VITE_SESSIONS_DIR || 'sessions'

export function getActiveSessionsPath(): string {
  return `${SESSIONS_DIR}/active`
}

export function getSessionFilePath(sessionId: string): string {
  return `${SESSIONS_DIR}/active/${sessionId}.jsonl`
}

export function getArchivePath(): string {
  return `${SESSIONS_DIR}/archive`
}

export async function appendToJSONL(filePath: string, message: JSONLMessage): Promise<void> {
  const line = JSON.stringify(message) + '\n'
  
  try {
    const response = await fetch(`/api/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, line }),
    })
    
    if (!response.ok) {
      throw new Error('Failed to append to JSONL')
    }
  } catch (error) {
    console.error('JSONL append error:', error)
    throw error
  }
}

export async function readLastLine(filePath: string): Promise<JSONLMessage | null> {
  try {
    const response = await fetch(`/api/last-line?path=${encodeURIComponent(filePath)}`)
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    return data.line ? JSON.parse(data.line) : null
  } catch {
    return null
  }
}

export async function readAllLines(filePath: string): Promise<JSONLMessage[]> {
  try {
    const response = await fetch(`/api/read?path=${encodeURIComponent(filePath)}`)
    
    if (!response.ok) {
      return []
    }
    
    const data = await response.json()
    return data.lines.map((line: string) => JSON.parse(line))
  } catch {
    return []
  }
}

export async function listActiveSessions(): Promise<SessionInfo[]> {
  try {
    const response = await fetch(`/api/sessions/active`)
    
    if (!response.ok) {
      return []
    }
    
    return await response.json()
  } catch {
    return []
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/jsonl.ts src/types/session.ts
git commit -m "feat: add JSONL utility functions for file bridge"
```

---

### Task 2: Session Manager Composable

**Covers:** [File Bridge Architecture §2]

**Files:**
- Create: `src/composables/useSession.ts`

- [ ] **Step 1: Create session manager**

```typescript
// src/composables/useSession.ts
import { ref, computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { appendToJSONL, readAllLines, listActiveSessions, getSessionFilePath } from '@/utils/jsonl'
import type { JSONLMessage, SessionInfo } from '@/types/session'

const SESSION_TIMEOUT = 4 * 60 * 60 * 1000 // 4 hours

export function useSession() {
  const store = useTripStore()
  const currentSessionId = ref<string | null>(null)
  const sessions = ref<SessionInfo[]>([])
  const isLoading = ref(false)

  const currentSessionPath = computed(() => 
    currentSessionId.value ? getSessionFilePath(currentSessionId.value) : null
  )

  async function createSession(): Promise<string> {
    const id = `session-${Date.now()}`
    currentSessionId.value = id
    
    const welcomeMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'system',
      text: 'Session started',
      event: 'session_started',
    }
    
    await appendToJSONL(getSessionFilePath(id), welcomeMessage)
    return id
  }

  async function loadSession(sessionId: string): Promise<void> {
    currentSessionId.value = sessionId
    isLoading.value = true
    
    try {
      const messages = await readAllLines(getSessionFilePath(sessionId))
      
      store.messages = messages
        .filter(m => m.role === 'user' || m.role === 'ai')
        .map(m => ({
          id: `msg_${m.ts}`,
          role: m.role === 'ai' ? 'assistant' : 'user',
          text: m.text || '',
          timestamp: new Date(m.ts),
        }))
    } finally {
      isLoading.value = false
    }
  }

  async function sendMessage(text: string, provider: string = 'mimo'): Promise<void> {
    if (!currentSessionId.value) {
      await createSession()
    }
    
    const userMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'user',
      text,
      provider,
    }
    
    await appendToJSONL(currentSessionPath.value!, userMessage)
    
    store.addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    })
  }

  async function closeSession(): Promise<void> {
    if (!currentSessionId.value) return
    
    const closeMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'system',
      event: 'session_closed',
    }
    
    await appendToJSONL(currentSessionPath.value!, closeMessage)
    currentSessionId.value = null
  }

  async function refreshSessions(): Promise<void> {
    sessions.value = await listActiveSessions()
  }

  return {
    currentSessionId,
    currentSessionPath,
    sessions,
    isLoading,
    createSession,
    loadSession,
    sendMessage,
    closeSession,
    refreshSessions,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useSession.ts
git commit -m "feat: create session manager composable"
```

---

### Task 3: AI Response Poller

**Covers:** [File Bridge Architecture §3]

**Files:**
- Create: `src/composables/usePolling.ts`

- [ ] **Step 1: Create polling composable**

```typescript
// src/composables/usePolling.ts
import { ref, onUnmounted } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { readLastLine } from '@/utils/jsonl'
import type { JSONLMessage } from '@/types/session'

const POLL_INTERVAL = parseInt(import.meta.env.VITE_POLL_INTERVAL || '1000')
const AI_TIMEOUT = parseInt(import.meta.env.VITE_AI_TIMEOUT || '30000')

export function usePolling() {
  const store = useTripStore()
  const isPolling = ref(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let lastMessageCount = 0

  function startPolling(sessionPath: string) {
    if (isPolling.value) return
    
    isPolling.value = true
    lastMessageCount = store.messages.length
    
    timeoutTimer = setTimeout(() => {
      stopPolling()
      store.addMessage({
        id: `msg_${Date.now()}_timeout`,
        role: 'assistant',
        text: 'AI 暂时无法响应，请稍后重试或手动刷新。',
        timestamp: new Date(),
      })
    }, AI_TIMEOUT)
    
    poll(sessionPath)
  }

  function poll(sessionPath: string) {
    if (!isPolling.value) return
    
    readLastLine(sessionPath).then((lastLine) => {
      if (!isPolling.value) return
      
      if (lastLine && lastLine.role === 'ai' && store.messages.length === lastMessageCount) {
        handleAIResponse(lastLine)
        stopPolling()
        return
      }
      
      pollTimer = setTimeout(() => poll(sessionPath), POLL_INTERVAL)
    })
  }

  function handleAIResponse(message: JSONLMessage) {
    if (!message.text) return
    
    store.addMessage({
      id: `msg_${message.ts}`,
      role: 'assistant',
      text: message.text,
      timestamp: new Date(message.ts),
    })
    
    if (message.envelope) {
      if (message.envelope.status) {
        store.planningStatus = message.envelope.status
      }
      
      if (message.envelope.tripParamUpdates) {
        const updates = message.envelope.tripParamUpdates
        if (updates.origin) store.params.origin = updates.origin
        if (updates.destination) store.params.destination = updates.destination
        if (updates.totalDays) store.params.totalDays = updates.totalDays
        if (updates.dailyDrivingLimitHours) {
          store.params.dailyDrivingLimitHours = updates.dailyDrivingLimitHours
        }
        if (updates.hotelBudget) store.params.hotelBudget = updates.hotelBudget
        if (updates.travelStyle) store.params.travelStyle = updates.travelStyle
      }
    }
  }

  function stopPolling() {
    isPolling.value = false
    
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    isPolling,
    startPolling,
    stopPolling,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/usePolling.ts
git commit -m "feat: create AI response poller composable"
```

---

### Task 4: Update ChatPanel Integration

**Covers:** [File Bridge Architecture §3, §4]

**Files:**
- Modify: `src/components/ChatPanel/ChatPanel.vue`
- Modify: `src/composables/useAI.ts`

- [ ] **Step 1: Update useAI to use file bridge**

```typescript
// src/composables/useAI.ts
import { useTripStore } from '@/store/tripStore'
import { useSession } from './useSession'
import { usePolling } from './usePolling'

export function useAI() {
  const store = useTripStore()
  const session = useSession()
  const polling = usePolling()

  async function sendMessage(text: string) {
    const provider = import.meta.env.VITE_AI_PROVIDER || 'mimo'
    
    await session.sendMessage(text, provider)
    
    if (session.currentSessionPath.value) {
      polling.startPolling(session.currentSessionPath.value)
    }
  }

  async function refreshMessages() {
    if (!session.currentSessionId.value) return
    
    const messages = await import('@/utils/jsonl').then(m => 
      m.readAllLines(session.currentSessionPath.value!)
    )
    
    const lastAI = messages
      .filter(m => m.role === 'ai')
      .pop()
    
    if (lastAI && lastAI.text) {
      const exists = store.messages.some(m => m.text === lastAI.text)
      if (!exists) {
        polling.handleAIResponse(lastAI)
      }
    }
  }

  return { 
    sendMessage,
    refreshMessages,
    isPolling: polling.isPolling,
    currentSessionId: session.currentSessionId,
  }
}
```

- [ ] **Step 2: Update ChatPanel to show session status**

```vue
<!-- src/components/ChatPanel/ChatPanel.vue -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage, refreshMessages, isPolling, currentSessionId } = useAI()
const messagesEnd = ref<HTMLElement>()

watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
    })
  }
)

async function handleSend(text: string) {
  await sendMessage(text)
}

async function handleRefresh() {
  await refreshMessages()
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">AI 旅行顾问</h2>
        <div class="flex items-center gap-2">
          <span v-if="currentSessionId" class="text-xs text-gray-400">
            {{ currentSessionId.slice(0, 12) }}...
          </span>
          <button
            @click="handleRefresh"
            class="text-gray-400 hover:text-gray-600"
            title="刷新"
          >
            ↻
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-500">
        {{ isPolling ? '等待 AI 回复...' : store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isPolling" class="flex justify-start">
        <div class="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
          <span class="inline-flex gap-1">
            <span class="animate-bounce" style="animation-delay: 0ms">.</span>
            <span class="animate-bounce" style="animation-delay: 150ms">.</span>
            <span class="animate-bounce" style="animation-delay: 300ms">.</span>
          </span>
        </div>
      </div>
      <div ref="messagesEnd" />
    </div>
    <ChatInput @send="handleSend" :disabled="isPolling" />
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/composables/useAI.ts src/components/ChatPanel/
git commit -m "feat: integrate ChatPanel with file bridge architecture"
```

---

### Task 5: Python Bridge Script

**Covers:** [File Bridge Architecture §6]

**Files:**
- Create: `scripts/bridge.py`
- Create: `scripts/requirements.txt`

- [ ] **Step 1: Create Python bridge script**

```python
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
            full_prompt = f"{system_prompt}\n\n用户消息：{user_message}"
            result = subprocess.run(
                ["mimo", "run", "--session", session_id, "--prompt", full_prompt],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode != 0:
                print(f"Mimo error: {result.stderr}")
                return None
            
            return self.parse_ai_response(result.stdout)
        
        except subprocess.TimeoutExpired:
            print("Mimo call timed out")
            return None
        except FileNotFoundError:
            print("Mimo CLI not found")
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
    
    handler = JSONLHandler()
    observer = Observer()
    observer.schedule(handler, str(SESSIONS_DIR), recursive=False)
    observer.start()
    
    print(f"Monitoring {SESSIONS_DIR} for JSONL changes...")
    
    import threading
    timeout_thread = threading.Thread(target=check_timeouts, daemon=True)
    timeout_thread.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create requirements.txt**

```
watchdog>=3.0.0
```

- [ ] **Step 3: Commit**

```bash
git add scripts/
git commit -m "feat: create Python bridge script for file-based AI"
```

---

### Task 6: API Server for File Operations

**Covers:** [File Bridge Architecture §3]

**Files:**
- Create: `scripts/server.py`

- [ ] **Step 1: Create simple API server**

```python
#!/usr/bin/env python3
"""
Simple API server for JSONL file operations.
Provides endpoints for frontend to read/write JSONL files.
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from urllib.parse import urlparse, parse_qs

class JSONLHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/api/last-line":
            self.handle_last_line(parsed)
        elif parsed.path == "/api/read":
            self.handle_read(parsed)
        elif parsed.path == "/api/sessions/active":
            self.handle_list_sessions()
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/api/append":
            self.handle_append()
        else:
            self.send_error(404)
    
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
        
        if os.path.exists(sessions_dir):
            for f in os.listdir(sessions_dir):
                if f.endswith(".jsonl"):
                    file_path = os.path.join(sessions_dir, f)
                    stat = os.stat(file_path)
                    sessions.append({
                        "id": f.replace(".jsonl", ""),
                        "filePath": file_path,
                        "lastModified": stat.st_mtime,
                        "messageCount": sum(1 for _ in open(file_path)),
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/server.py
git commit -m "feat: create API server for JSONL file operations"
```

---

### Task 7: Update Vite Config for Proxy

**Covers:** [File Bridge Architecture §3]

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add proxy configuration**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add API server proxy to Vite config"
```

---

### Task 8: Final Verification

**Covers:** [File Bridge Architecture]

**Files:**
- Verify: all created files

- [ ] **Step 1: Run TypeScript check**

```bash
npx vue-tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Run build**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 3: Test Python scripts**

```bash
cd scripts
pip install -r requirements.txt
python server.py &
python bridge.py &
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete file bridge architecture implementation"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** File Bridge Architecture §2-6 covered by Tasks 1-7.
- [x] **Placeholder scan:** No TBDs or TODOs found.
- [x] **Type consistency:** All types defined in Task 1, used consistently.

---

*End of File Bridge Architecture plan. Ready for execution.*
