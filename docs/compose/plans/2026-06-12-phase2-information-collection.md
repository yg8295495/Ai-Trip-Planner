# Phase 2 — Information Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the chat panel to an OpenAI-compatible AI backend, implement COLLECTING mode to gather trip parameters (origin, destination, totalDays), and parse structured AI responses.

**Architecture:** AIOrchestrator calls OpenAI-compatible API with system prompts from versioned files. ResponseParser extracts JSON envelope from AI responses. ChatPanel integrates with the orchestrator for real conversation. COLLECTING mode detects when required fields are complete and transitions to PLANNING.

**Tech Stack:** Vue 3, TypeScript, Pinia, OpenAI-compatible API

---

### Task 1: Environment Variables Setup

**Covers:** [S2]

**Files:**
- Create: `.env.example`, `.env`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create .env.example**

```bash
# AI API Configuration (OpenAI compatible)
VITE_AI_API_BASE_URL=https://api.openai.com/v1
VITE_AI_API_KEY=your-api-key-here
VITE_AI_MODEL=gpt-4o
```

- [ ] **Step 2: Create .env (with placeholder values)**

```bash
# AI API Configuration
VITE_AI_API_BASE_URL=https://api.openai.com/v1
VITE_AI_API_KEY=sk-your-key-here
VITE_AI_MODEL=gpt-4o
```

- [ ] **Step 3: Update .gitignore**

Add to `.gitignore`:
```
.env
.env.local
.env.*.local
```

- [ ] **Step 4: Create env types**

Create `src/types/env.d.ts`:
```typescript
interface ImportMetaEnv {
  readonly VITE_AI_API_BASE_URL: string
  readonly VITE_AI_API_KEY: string
  readonly VITE_AI_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 5: Commit**

```bash
git add .env.example .env src/types/env.d.ts .gitignore
git commit -m "chore: add environment variable configuration for AI API"
```

---

### Task 2: System Prompts

**Covers:** [S4.5]

**Files:**
- Create: `src/prompts/v1/role.txt`, `src/prompts/v1/format.txt`, `src/prompts/v1/constraints.txt`, `src/prompts/v1/collection.txt`

- [ ] **Step 1: Create role.txt**

```
你是一位专业的自驾游旅行顾问。你的工作是帮助用户规划从A到B的自驾旅行。

你的职责：
1. 通过对话收集旅行参数（出发地、目的地、天数等）
2. 根据用户需求推荐沿途景点、餐厅、住宿
3. 始终监控驾驶时间限制，主动提醒超限情况
4. 提供真实、实用的旅行建议

你应该表现得友好、专业、有耐心。如果信息不足，主动询问。
```

- [ ] **Step 2: Create format.txt**

```
你必须始终以JSON格式回复。回复格式如下：

{
  "chat": "你给用户的自然语言回复",
  "status": "collecting | planning | refining",
  "tripParamUpdates": {
    "origin": "出发地名称（如果用户提到）",
    "destination": "目的地名称（如果用户提到）",
    "totalDays": 数字（如果用户提到）,
    "dailyDrivingLimitHours": 数字（如果用户提到）,
    "hotelBudget": "budget | mid | luxury（如果用户提到）",
    "travelStyle": ["nature", "food", "culture"]（如果用户提到）
  },
  "locationUpdates": [],
  "itineraryNotes": "",
  "missingFields": ["origin", "destination", "totalDays"]
}

规则：
- chat 字段必须是自然语言，不要包含JSON
- status 字段表示当前状态：collecting（收集中）、planning（规划中）、refining（调整中）
- tripParamUpdates 只包含用户本次提到的参数，未提到的不要包含
- missingFields 列出还未收集到的必填字段
- locationUpdates 在 collecting 阶段为空数组
```

- [ ] **Step 3: Create constraints.txt**

```
约束条件：
1. 每日驾驶时间限制：用户设定的值（默认5小时）
2. 如果某天驾驶时间超过限制，必须在 itineraryNotes 中提醒
3. 不要推荐已经超出用户预算的住宿
4. 如果用户没有指定某些参数，使用默认值

必填参数（collecting 阶段必须收集）：
- origin（出发地）
- destination（目的地）
- totalDays（总天数）

可选参数（有默认值）：
- dailyDrivingLimitHours（默认5）
- hotelBudget（默认 mid）
- travelStyle（默认空数组）
```

- [ ] **Step 4: Create collection.txt**

```
信息收集策略：

阶段1：收集必填参数
- 如果 origin 缺失，询问："您计划从哪里出发？"
- 如果 destination 缺失，询问："您的目的地是哪里？"
- 如果 totalDays 缺失，询问："您计划旅行几天？"

阶段2：确认参数
- 当所有必填参数收集完成后，总结确认："好的，我确认一下：从{origin}到{destination}，共{totalDays}天。"
- 然后切换到 planning 状态

阶段3：可选参数
- 如果用户主动提到驾驶限制、预算、旅行风格，更新对应参数
- 不要主动询问这些可选参数，除非用户提到
```

- [ ] **Step 5: Commit**

```bash
git add src/prompts/v1/
git commit -m "feat: add system prompts for AI travel advisor"
```

---

### Task 3: ResponseParser

**Covers:** [S4.6]

**Files:**
- Create: `src/services/ai/ResponseParser.ts`

- [ ] **Step 1: Create ResponseParser**

```typescript
import type { AIResponseEnvelope, TripParams, LocationUpdate } from '@/types'

const DEFAULT_RESPONSE: AIResponseEnvelope = {
  chat: '抱歉，我遇到了一些问题。请再试一次。',
  status: 'collecting',
  tripParamUpdates: {},
  locationUpdates: [],
  itineraryNotes: '',
  missingFields: ['origin', 'destination', 'totalDays'],
}

export function parseAIResponse(raw: string): AIResponseEnvelope {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { ...DEFAULT_RESPONSE, chat: raw }
    }

    const parsed = JSON.parse(jsonMatch[0])

    const chat = typeof parsed.chat === 'string' ? parsed.chat : raw
    const status = isValidStatus(parsed.status) ? parsed.status : 'collecting'
    const tripParamUpdates = sanitizeTripParamUpdates(parsed.tripParamUpdates)
    const locationUpdates = sanitizeLocationUpdates(parsed.locationUpdates)
    const itineraryNotes = typeof parsed.itineraryNotes === 'string' ? parsed.itineraryNotes : ''
    const missingFields = Array.isArray(parsed.missingFields) ? parsed.missingFields : []

    return {
      chat,
      status,
      tripParamUpdates,
      locationUpdates,
      itineraryNotes,
      missingFields,
    }
  } catch {
    return { ...DEFAULT_RESPONSE, chat: raw }
  }
}

function isValidStatus(status: unknown): status is AIResponseEnvelope['status'] {
  return status === 'collecting' || status === 'planning' || status === 'refining'
}

function sanitizeTripParamUpdates(raw: unknown): Partial<TripParams> {
  if (!raw || typeof raw !== 'object') return {}

  const updates: Partial<TripParams> = {}
  const data = raw as Record<string, unknown>

  if (typeof data.origin === 'string') updates.origin = data.origin as unknown as TripParams['origin']
  if (typeof data.destination === 'string') updates.destination = data.destination as unknown as TripParams['destination']
  if (typeof data.totalDays === 'number' && data.totalDays > 0) updates.totalDays = data.totalDays
  if (typeof data.dailyDrivingLimitHours === 'number' && data.dailyDrivingLimitHours > 0) {
    updates.dailyDrivingLimitHours = data.dailyDrivingLimitHours
  }
  if (data.hotelBudget === 'budget' || data.hotelBudget === 'mid' || data.hotelBudget === 'luxury') {
    updates.hotelBudget = data.hotelBudget
  }
  if (Array.isArray(data.travelStyle)) {
    updates.travelStyle = data.travelStyle.filter((s): s is TripParams['travelStyle'][number] =>
      ['nature', 'culture', 'food', 'adventure', 'cities', 'relaxed'].includes(s)
    )
  }

  return updates
}

function sanitizeLocationUpdates(raw: unknown): LocationUpdate[] {
  if (!Array.isArray(raw)) return []

  return raw.filter((item): item is LocationUpdate => {
    if (!item || typeof item !== 'object') return false
    const loc = item as Record<string, unknown>
    return (
      typeof loc.id === 'string' &&
      typeof loc.name === 'string' &&
      typeof loc.lat === 'number' &&
      typeof loc.lon === 'number'
    )
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/ResponseParser.ts
git commit -m "feat: create ResponseParser for AI JSON envelope"
```

---

### Task 4: PromptManager

**Covers:** [S4.5]

**Files:**
- Create: `src/services/ai/PromptManager.ts`

- [ ] **Step 1: Create PromptManager**

```typescript
import type { TripParams, ConversationMessage } from '@/types'

const ROLE_PROMPT = `你是一位专业的自驾游旅行顾问。你的工作是帮助用户规划从A到B的自驾旅行。

你的职责：
1. 通过对话收集旅行参数（出发地、目的地、天数等）
2. 根据用户需求推荐沿途景点、餐厅、住宿
3. 始终监控驾驶时间限制，主动提醒超限情况
4. 提供真实、实用的旅行建议

你应该表现得友好、专业、有耐心。如果信息不足，主动询问。`

const FORMAT_PROMPT = `你必须始终以JSON格式回复。回复格式如下：

{
  "chat": "你给用户的自然语言回复",
  "status": "collecting | planning | refining",
  "tripParamUpdates": {
    "origin": "出发地名称（如果用户提到）",
    "destination": "目的地名称（如果用户提到）",
    "totalDays": 数字（如果用户提到）,
    "dailyDrivingLimitHours": 数字（如果用户提到）,
    "hotelBudget": "budget | mid | luxury（如果用户提到）",
    "travelStyle": ["nature", "food", "culture"]（如果用户提到）
  },
  "locationUpdates": [],
  "itineraryNotes": "",
  "missingFields": ["origin", "destination", "totalDays"]
}

规则：
- chat 字段必须是自然语言，不要包含JSON
- status 字段表示当前状态：collecting（收集中）、planning（规划中）、refining（调整中）
- tripParamUpdates 只包含用户本次提到的参数，未提到的不要包含
- missingFields 列出还未收集到的必填字段
- locationUpdates 在 collecting 阶段为空数组`

const CONSTRAINTS_PROMPT = `约束条件：
1. 每日驾驶时间限制：用户设定的值（默认5小时）
2. 如果某天驾驶时间超过限制，必须在 itineraryNotes 中提醒
3. 不要推荐已经超出用户预算的住宿
4. 如果用户没有指定某些参数，使用默认值

必填参数（collecting 阶段必须收集）：
- origin（出发地）
- destination（目的地）
- totalDays（总天数）

可选参数（有默认值）：
- dailyDrivingLimitHours（默认5）
- hotelBudget（默认 mid）
- travelStyle（默认空数组）`

const COLLECTION_PROMPT = `信息收集策略：

阶段1：收集必填参数
- 如果 origin 缺失，询问："您计划从哪里出发？"
- 如果 destination 缺失，询问："您的目的地是哪里？"
- 如果 totalDays 缺失，询问："您计划旅行几天？"

阶段2：确认参数
- 当所有必填参数收集完成后，总结确认："好的，我确认一下：从{origin}到{destination}，共{totalDays}天。"
- 然后切换到 planning 状态

阶段3：可选参数
- 如果用户主动提到驾驶限制、预算、旅行风格，更新对应参数
- 不要主动询问这些可选参数，除非用户提到`

function buildStateBlock(params: TripParams): string {
  const state: Record<string, unknown> = {
    origin: params.origin?.shortName || '未设置',
    destination: params.destination?.shortName || '未设置',
    totalDays: params.totalDays || '未设置',
    dailyDrivingLimitHours: params.dailyDrivingLimitHours,
    hotelBudget: params.hotelBudget,
    travelStyle: params.travelStyle.length > 0 ? params.travelStyle : '未设置',
  }

  return `[当前旅行状态]\n${JSON.stringify(state, null, 2)}`
}

function buildHistoryBlock(messages: ConversationMessage[]): string {
  if (messages.length === 0) return ''

  const recent = messages.slice(-20)
  const lines = recent.map((msg) => {
    const role = msg.role === 'user' ? '用户' : '助手'
    return `${role}: ${msg.text}`
  })

  return `[对话历史]\n${lines.join('\n')}`
}

export function buildPrompt(
  params: TripParams,
  messages: ConversationMessage[],
  userMessage: string
): string {
  const parts = [
    ROLE_PROMPT,
    '',
    FORMAT_PROMPT,
    '',
    CONSTRAINTS_PROMPT,
    '',
    COLLECTION_PROMPT,
    '',
    buildStateBlock(params),
    '',
    buildHistoryBlock(messages),
    '',
    `[用户消息]\n${userMessage}`,
  ]

  return parts.filter(Boolean).join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/PromptManager.ts
git commit -m "feat: create PromptManager for building AI prompts"
```

---

### Task 5: AIOrchestrator

**Covers:** [S4.4]

**Files:**
- Create: `src/services/ai/AIOrchestrator.ts`

- [ ] **Step 1: Create AIOrchestrator**

```typescript
import type { TripParams, ConversationMessage, AIResponseEnvelope } from '@/types'
import { buildPrompt } from './PromptManager'
import { parseAIResponse } from './ResponseParser'

interface AIConfig {
  baseUrl: string
  apiKey: string
  model: string
}

function getConfig(): AIConfig {
  return {
    baseUrl: import.meta.env.VITE_AI_API_BASE_URL,
    apiKey: import.meta.env.VITE_AI_API_KEY,
    model: import.meta.env.VITE_AI_MODEL,
  }
}

export async function callAI(
  params: TripParams,
  messages: ConversationMessage[],
  userMessage: string
): Promise<AIResponseEnvelope> {
  const config = getConfig()

  if (!config.apiKey || config.apiKey === 'sk-your-key-here') {
    return generateMockResponse(params, userMessage)
  }

  const prompt = buildPrompt(params, messages, userMessage)

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    return parseAIResponse(content)
  } catch (error) {
    console.error('AI API error:', error)
    return generateMockResponse(params, userMessage)
  }
}

function generateMockResponse(
  params: TripParams,
  userMessage: string
): AIResponseEnvelope {
  const missing: string[] = []
  if (!params.origin) missing.push('origin')
  if (!params.destination) missing.push('destination')
  if (!params.totalDays) missing.push('totalDays')

  if (missing.length > 0) {
    const questions: string[] = []
    if (!params.origin) questions.push('您计划从哪里出发？')
    if (!params.destination) questions.push('您的目的地是哪里？')
    if (!params.totalDays) questions.push('您计划旅行几天？')

    return {
      chat: questions.join('\n'),
      status: 'collecting',
      tripParamUpdates: {},
      locationUpdates: [],
      itineraryNotes: '',
      missingFields: missing,
    }
  }

  return {
    chat: `好的，我确认一下：从${params.origin!.shortName}到${params.destination!.shortName}，共${params.totalDays}天。让我来为您规划路线。`,
    status: 'planning',
    tripParamUpdates: {},
    locationUpdates: [],
    itineraryNotes: '',
    missingFields: [],
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ai/AIOrchestrator.ts
git commit -m "feat: create AIOrchestrator with mock fallback"
```

---

### Task 6: useAI Composable

**Covers:** [S4.4]

**Files:**
- Create: `src/composables/useAI.ts`

- [ ] **Step 1: Create useAI composable**

```typescript
import { useTripStore } from '@/store/tripStore'
import { callAI } from '@/services/ai/AIOrchestrator'

export function useAI() {
  const store = useTripStore()

  async function sendMessage(text: string) {
    store.addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    })

    store.isLoading = true

    try {
      const response = await callAI(
        store.params,
        store.messages,
        text
      )

      store.addMessage({
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        text: response.chat,
        timestamp: new Date(),
      })

      if (response.tripParamUpdates.origin) {
        store.params.origin = response.tripParamUpdates.origin
      }
      if (response.tripParamUpdates.destination) {
        store.params.destination = response.tripParamUpdates.destination
      }
      if (response.tripParamUpdates.totalDays) {
        store.params.totalDays = response.tripParamUpdates.totalDays
      }
      if (response.tripParamUpdates.dailyDrivingLimitHours) {
        store.params.dailyDrivingLimitHours = response.tripParamUpdates.dailyDrivingLimitHours
      }
      if (response.tripParamUpdates.hotelBudget) {
        store.params.hotelBudget = response.tripParamUpdates.hotelBudget
      }
      if (response.tripParamUpdates.travelStyle) {
        store.params.travelStyle = response.tripParamUpdates.travelStyle
      }

      if (response.status) {
        store.planningStatus = response.status
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      store.addMessage({
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        text: '抱歉，发送消息时出错了。请再试一次。',
        timestamp: new Date(),
      })
    } finally {
      store.isLoading = false
    }
  }

  return { sendMessage }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useAI.ts
git commit -m "feat: create useAI composable for chat integration"
```

---

### Task 7: ChatPanel Integration

**Covers:** [S4.1]

**Files:**
- Modify: `src/components/ChatPanel/ChatPanel.vue`

- [ ] **Step 1: Update ChatPanel to use useAI**

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage } = useAI()
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
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3">
      <h2 class="text-lg font-semibold text-gray-800">AI 旅行顾问</h2>
      <p class="text-xs text-gray-500">
        {{ store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="store.isLoading" class="flex justify-start">
        <div class="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
          思考中...
        </div>
      </div>
      <div ref="messagesEnd" />
    </div>
    <ChatInput @send="handleSend" :disabled="store.isLoading" />
  </div>
</template>
```

- [ ] **Step 2: Update ChatInput to support disabled state**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const input = ref('')

function handleSend() {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="border-t border-gray-200 p-3">
    <div class="flex items-end gap-2">
      <textarea
        v-model="input"
        placeholder="输入你的旅行需求..."
        rows="1"
        :disabled="disabled"
        class="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        @keydown="handleKeydown"
      />
      <button
        class="rounded-xl bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
        :disabled="!input.trim() || disabled"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatPanel/
git commit -m "feat: integrate ChatPanel with AI orchestrator"
```

---

### Task 8: TripParams Auto-Detection

**Covers:** [S4.4]

**Files:**
- Create: `src/logic/TripParamDetector.ts`
- Modify: `src/composables/useAI.ts`

- [ ] **Step 1: Create TripParamDetector**

```typescript
import type { TripParams, GeocodedPlace } from '@/types'

interface DetectedParams {
  origin?: string
  destination?: string
  totalDays?: number
}

export function detectParamsFromText(text: string): DetectedParams {
  const result: DetectedParams = {}

  const originPatterns = [
    /从(.+?)(?:出发|到|去|→)/,
    /出发[地自]?(?:是|为|：|:)\s*(.+?)(?:[，,。\n]|$)/,
    /起点[是为：:]\s*(.+?)(?:[，,。\n]|$)/,
  ]

  const destPatterns = [
    /到(.+?)(?:[，,。\n]|$)/,
    /去(.+?)(?:[，,。\n]|$)/,
    /目的[地](?:是|为|：|:)\s*(.+?)(?:[，,。\n]|$)/,
    /终点[是为：:]\s*(.+?)(?:[，,。\n]|$)/,
  ]

  const dayPatterns = [
    /(\d+)\s*天/,
    /共\s*(\d+)\s*天/,
    /(\d+)\s*日/,
  ]

  for (const pattern of originPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.origin = match[1].trim()
      break
    }
  }

  for (const pattern of destPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.destination = match[1].trim()
      break
    }
  }

  for (const pattern of dayPatterns) {
    const match = text.match(pattern)
    if (match) {
      const days = parseInt(match[1], 10)
      if (days > 0 && days <= 30) {
        result.totalDays = days
        break
      }
    }
  }

  return result
}

export function createGeocodedPlace(name: string): GeocodedPlace {
  return {
    query: name,
    lat: 0,
    lon: 0,
    shortName: name,
    fullName: name,
  }
}
```

- [ ] **Step 2: Update useAI to use TripParamDetector**

Add to `src/composables/useAI.ts`:
```typescript
import { detectParamsFromText, createGeocodedPlace } from '@/logic/TripParamDetector'

// In sendMessage function, before calling callAI:
const detected = detectParamsFromText(text)
if (detected.origin && !store.params.origin) {
  store.params.origin = createGeocodedPlace(detected.origin)
}
if (detected.destination && !store.params.destination) {
  store.params.destination = createGeocodedPlace(detected.destination)
}
if (detected.totalDays && !store.params.totalDays) {
  store.params.totalDays = detected.totalDays
}
```

- [ ] **Step 3: Commit**

```bash
git add src/logic/TripParamDetector.ts src/composables/useAI.ts
git commit -m "feat: add TripParamDetector for auto-extracting params from text"
```

---

### Task 9: Final Verification

**Covers:** [S4.4]

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

- [ ] **Step 3: Test mock flow**

Start dev server and test:
1. Type "我想从上海去成都，10天" → Should auto-detect params
2. AI should respond confirming the params
3. Status should change from "collecting" to "planning"

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 2 information collection"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** S4.4 (AIOrchestrator) → Tasks 3-6. S4.5 (PromptManager) → Task 4. S4.6 (ResponseParser) → Task 3. S4.1 (ChatPanel) → Task 7.
- [x] **Placeholder scan:** No TBDs or TODOs found.
- [x] **Type consistency:** All types from types/index.ts used consistently.

---

*End of Phase 2 plan. Ready for execution.*
