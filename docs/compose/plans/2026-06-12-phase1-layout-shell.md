# Phase 1 — Layout Shell Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/ai-trip-planner-phase1.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Vue 3 + Vite project with a three-panel layout (Chat | Map | Itinerary) rendering static mock data and a 高德地图 with pins and polyline.

**Architecture:** Vue 3 SFC components with Composition API (`<script setup>`). Pinia for state. Tailwind CSS for styling. 高德地图 JS API for map rendering. All data is static/mock — no AI or API calls yet.

**Tech Stack:** Vue 3, TypeScript, Vite, Pinia, Tailwind CSS, 高德地图 JS API

---

### Task 1: Project Setup

**Covers:** [S2, S6]

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `src/main.ts`, `src/App.vue`, `index.html`

- [ ] **Step 1: Scaffold Vite + Vue 3 project**

```bash
npm create vite@latest . -- --template vue-ts
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install pinia @vueuse/core
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind CSS**

Create `src/assets/main.css`:
```css
@import "tailwindcss";
```

Update `src/main.ts`:
```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

- [ ] **Step 4: Create folder structure**

```bash
mkdir -p src/{components/{ChatPanel,MapPanel,ItineraryStrip,Layout},services/{ai,routing,geocoding},store,logic,prompts/v1,types,constants,composables}
```

- [ ] **Step 5: Verify dev server runs**

```bash
npm run dev
```
Expected: Browser opens at localhost:5173, shows default Vue page.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vue 3 + Vite project with Tailwind and Pinia"
```

---

### Task 2: TypeScript Types

**Covers:** [S5]

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Define all interfaces**

```typescript
export interface GeocodedPlace {
  query: string
  lat: number
  lon: number
  shortName: string
  fullName: string
}

export type TravelStyleTag = 'nature' | 'culture' | 'food' | 'adventure' | 'cities' | 'relaxed'

export interface TripParams {
  origin: GeocodedPlace | null
  destination: GeocodedPlace | null
  totalDays: number | null
  departureDate: Date | null
  dailyDrivingLimitHours: number
  hotelBudget: 'budget' | 'mid' | 'luxury'
  travelStyle: TravelStyleTag[]
}

export interface Location {
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
  category: 'city' | 'scenic' | 'food' | 'nature' | 'culture' | 'hotel'
  description: string
  suggested: boolean
  selected: boolean
  dayHint: number | null
}

export interface DrivingLeg {
  fromId: string
  toId: string
  distanceKm: number
  durationHours: number
}

export interface ItineraryDay {
  dayNumber: number
  date: Date | null
  overnightLocation: Location
  stops: Location[]
  totalDriveHours: number
  totalDistanceKm: number
  isOverLimit: boolean
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
}

export interface AIResponseEnvelope {
  chat: string
  status: 'collecting' | 'planning' | 'refining'
  tripParamUpdates: Partial<TripParams>
  locationUpdates: LocationUpdate[]
  itineraryNotes: string
  missingFields: string[]
}

export interface LocationUpdate {
  action: 'add' | 'remove' | 'update'
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
  category: Location['category']
  description: string
  suggested: boolean
  selected: boolean
  dayHint: number | null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript interfaces for all data models"
```

---

### Task 3: Constants

**Covers:** [S6]

**Files:**
- Create: `src/constants/defaults.ts`, `src/constants/categories.ts`

- [ ] **Step 1: Create defaults**

```typescript
export const DAILY_LIMIT_DEFAULT = 5
export const HOTEL_BUDGET_DEFAULT = 'mid' as const
export const TRAVEL_STYLE_DEFAULT: string[] = []
export const TOTAL_DAYS_DEFAULT = 3
```

- [ ] **Step 2: Create category config**

```typescript
import type { Location } from '@/types'

export const CATEGORY_COLORS: Record<Location['category'], string> = {
  city: '#3B82F6',
  scenic: '#22C55E',
  food: '#EAB308',
  nature: '#22C55E',
  culture: '#A855F7',
  hotel: '#A855F7',
}

export const CATEGORY_LABELS: Record<Location['category'], string> = {
  city: '城市',
  scenic: '景点',
  food: '美食',
  nature: '自然',
  culture: '文化',
  hotel: '住宿',
}

export const PIN_STATUS_COLORS = {
  confirmed: '#22C55E',
  suggested: '#3B82F6',
  food: '#EAB308',
  hotel: '#A855F7',
  removed: '#6B7280',
}
```

- [ ] **Step 3: Commit**

```bash
git add src/constants/
git commit -m "feat: add default constants and category color config"
```

---

### Task 4: Pinia Store with Mock Data

**Covers:** [S7]

**Files:**
- Create: `src/store/tripStore.ts`

- [ ] **Step 1: Create store with mock data**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripParams, Location, DrivingLeg, ItineraryDay, ConversationMessage } from '@/types'
import { DAILY_LIMIT_DEFAULT, HOTEL_BUDGET_DEFAULT } from '@/constants/defaults'

const MOCK_ORIGIN = { query: '上海', lat: 31.2304, lon: 121.4737, shortName: '上海, 中国', fullName: '上海市, 中国' }
const MOCK_DESTINATION = { query: '成都', lat: 30.5728, lon: 104.0668, shortName: '成都, 中国', fullName: '成都市, 四川省, 中国' }

const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc_hangzhou',
    name: '杭州西湖',
    shortName: '杭州, 浙江',
    lat: 30.2500,
    lon: 120.1500,
    category: 'scenic',
    description: 'UNESCO世界遗产，环绕着古塔和茶园。建议停留3-4小时。',
    suggested: true,
    selected: true,
    dayHint: 1,
  },
  {
    id: 'loc_huangshan',
    name: '黄山',
    shortName: '黄山, 安徽',
    lat: 30.1375,
    lon: 118.1694,
    category: 'nature',
    description: '中国最著名的山脉之一，以奇松、怪石、云海闻名。建议停留1-2天。',
    suggested: true,
    selected: true,
    dayHint: 2,
  },
  {
    id: 'loc_wuyishan',
    name: '武夷山',
    shortName: '武夷山, 福建',
    lat: 27.7583,
    lon: 117.6613,
    category: 'nature',
    description: '丹霞地貌与九曲溪竹筏漂流。建议停留1天。',
    suggested: true,
    selected: true,
    dayHint: 3,
  },
  {
    id: 'loc_changsha_food',
    name: '长沙美食',
    shortName: '长沙, 湖南',
    lat: 28.2282,
    lon: 112.9388,
    category: 'food',
    description: '臭豆腐、小龙虾、茶颜悦色。长沙是美食之都。',
    suggested: true,
    selected: false,
    dayHint: 4,
  },
]

const MOCK_MESSAGES: ConversationMessage[] = [
  {
    id: 'msg_1',
    role: 'user',
    text: '我想从上海自驾去成都，大概10天时间，每天开5小时左右',
    timestamp: new Date('2026-06-12T10:00:00'),
  },
  {
    id: 'msg_2',
    role: 'assistant',
    text: '好的！上海到成都自驾是个很棒的路线。我来帮你规划一下。\n\n根据你的10天行程和每天5小时的驾驶限制，我建议走这条经典路线：\n上海 → 杭州 → 黄山 → 武夷山 → 长沙 → 张家界 → 重庆 → 成都\n\n沿途有很多值得停留的地方，我已经在地图上标注了一些推荐地点。你看看这些地方感兴趣吗？',
    timestamp: new Date('2026-06-12T10:00:05'),
  },
]

const MOCK_DRIVING_LEGS: DrivingLeg[] = [
  { fromId: 'loc_origin', toId: 'loc_hangzhou', distanceKm: 170, durationHours: 2.0 },
  { fromId: 'loc_hangzhou', toId: 'loc_huangshan', distanceKm: 250, durationHours: 3.0 },
  { fromId: 'loc_huangshan', toId: 'loc_wuyishan', distanceKm: 350, durationHours: 4.0 },
  { fromId: 'loc_wuyishan', toId: 'loc_changsha_food', distanceKm: 600, durationHours: 7.0 },
]

const MOCK_ITINERARY: ItineraryDay[] = [
  {
    dayNumber: 1,
    date: null,
    overnightLocation: MOCK_LOCATIONS[0],
    stops: [MOCK_LOCATIONS[0]],
    totalDriveHours: 2.0,
    totalDistanceKm: 170,
    isOverLimit: false,
  },
  {
    dayNumber: 2,
    date: null,
    overnightLocation: MOCK_LOCATIONS[1],
    stops: [MOCK_LOCATIONS[1]],
    totalDriveHours: 3.0,
    totalDistanceKm: 250,
    isOverLimit: false,
  },
  {
    dayNumber: 3,
    date: null,
    overnightLocation: MOCK_LOCATIONS[2],
    stops: [MOCK_LOCATIONS[2]],
    totalDriveHours: 4.0,
    totalDistanceKm: 350,
    isOverLimit: false,
  },
  {
    dayNumber: 4,
    date: null,
    overnightLocation: MOCK_LOCATIONS[3],
    stops: [MOCK_LOCATIONS[3]],
    totalDriveHours: 7.0,
    totalDistanceKm: 600,
    isOverLimit: true,
  },
]

export const useTripStore = defineStore('trip', () => {
  const params = ref<TripParams>({
    origin: MOCK_ORIGIN,
    destination: MOCK_DESTINATION,
    totalDays: 10,
    departureDate: null,
    dailyDrivingLimitHours: DAILY_LIMIT_DEFAULT,
    hotelBudget: HOTEL_BUDGET_DEFAULT,
    travelStyle: ['nature', 'food'],
  })

  const locations = ref<Location[]>(MOCK_LOCATIONS)
  const drivingLegs = ref<DrivingLeg[]>(MOCK_DRIVING_LEGS)
  const itinerary = ref<ItineraryDay[]>(MOCK_ITINERARY)
  const messages = ref<ConversationMessage[]>(MOCK_MESSAGES)
  const isLoading = ref(false)
  const selectedDay = ref<number | null>(null)
  const selectedLocationId = ref<string | null>(null)
  const planningStatus = ref<'collecting' | 'planning' | 'refining'>('planning')

  const confirmedLocations = computed(() =>
    locations.value.filter((l) => l.selected)
  )

  function addLocation(loc: Location) {
    locations.value.push(loc)
  }

  function toggleLocation(id: string) {
    const loc = locations.value.find((l) => l.id === id)
    if (loc) loc.selected = !loc.selected
  }

  function removeLocation(id: string) {
    locations.value = locations.value.filter((l) => l.id !== id)
  }

  function addMessage(msg: ConversationMessage) {
    messages.value.push(msg)
  }

  function setSelectedDay(day: number | null) {
    selectedDay.value = day
  }

  function setSelectedLocation(id: string | null) {
    selectedLocationId.value = id
  }

  return {
    params,
    locations,
    drivingLegs,
    itinerary,
    messages,
    isLoading,
    selectedDay,
    selectedLocationId,
    planningStatus,
    confirmedLocations,
    addLocation,
    toggleLocation,
    removeLocation,
    addMessage,
    setSelectedDay,
    setSelectedLocation,
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/store/tripStore.ts
git commit -m "feat: create Pinia store with mock trip data"
```

---

### Task 5: AppLayout — Three-Panel Grid

**Covers:** [S1, S6]

**Files:**
- Create: `src/components/Layout/AppLayout.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Create AppLayout component**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="h-screen w-screen grid grid-cols-[320px_1fr_360px] grid-rows-[1fr] overflow-hidden bg-gray-50">
    <aside class="flex flex-col border-r border-gray-200 bg-white">
      <slot name="chat" />
    </aside>
    <main class="relative">
      <slot name="map" />
    </main>
    <aside class="flex flex-col border-l border-gray-200 bg-white">
      <slot name="itinerary" />
    </aside>
  </div>
</template>
```

- [ ] **Step 2: Update App.vue**

```vue
<script setup lang="ts">
import AppLayout from './components/Layout/AppLayout.vue'
import ChatPanel from './components/ChatPanel/ChatPanel.vue'
import MapPanel from './components/MapPanel/MapPanel.vue'
import ItineraryStrip from './components/ItineraryStrip/ItineraryStrip.vue'
</script>

<template>
  <AppLayout>
    <template #chat>
      <ChatPanel />
    </template>
    <template #map>
      <MapPanel />
    </template>
    <template #itinerary>
      <ItineraryStrip />
    </template>
  </AppLayout>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout/AppLayout.vue src/App.vue
git commit -m "feat: create three-panel layout grid"
```

---

### Task 6: ChatPanel — Static Messages

**Covers:** [S4.1]

**Files:**
- Create: `src/components/ChatPanel/ChatPanel.vue`, `src/components/ChatPanel/MessageBubble.vue`, `src/components/ChatPanel/ChatInput.vue`

- [ ] **Step 1: Create MessageBubble**

```vue
<script setup lang="ts">
import type { ConversationMessage } from '@/types'

const props = defineProps<{
  message: ConversationMessage
}>()
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed',
        message.role === 'user'
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-800',
      ]"
    >
      {{ message.text }}
    </div>
  </div>
</template>
```

- [ ] **Step 2: Create ChatInput**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  send: [text: string]
}>()

const input = ref('')

function handleSend() {
  const text = input.value.trim()
  if (!text) return
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
        class="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        @keydown="handleKeydown"
      />
      <button
        class="rounded-xl bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
        :disabled="!input.trim()"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create ChatPanel**

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const messagesEnd = ref<HTMLElement>()

watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
    })
  }
)

function handleSend(text: string) {
  store.addMessage({
    id: `msg_${Date.now()}`,
    role: 'user',
    text,
    timestamp: new Date(),
  })
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3">
      <h2 class="text-lg font-semibold text-gray-800">AI 旅行顾问</h2>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div ref="messagesEnd" />
    </div>
    <ChatInput @send="handleSend" />
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatPanel/
git commit -m "feat: create ChatPanel with message bubbles and input"
```

---

### Task 7: MapPanel — 高德地图 with Static Pins

**Covers:** [S4.2, S6]

**Files:**
- Create: `src/components/MapPanel/MapPanel.vue`, `src/composables/useMap.ts`
- Modify: `index.html` (add 高德地图 JS API script)

- [ ] **Step 1: Add 高德地图 script to index.html**

Add to `<head>` in `index.html`:
```html
<script src="https://webapi.amap.com/maps?v=2.0&key=YOUR_AMAP_KEY"></script>
```

Note: Replace `YOUR_AMAP_KEY` with actual 高德 JS API key. For development, get one from https://console.amap.com/

- [ ] **Step 2: Create useMap composable**

```typescript
import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { CATEGORY_COLORS, PIN_STATUS_COLORS } from '@/constants/categories'

declare global {
  interface Window {
    AMap: any
  }
}

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let polyline: any = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    map = new window.AMap.Map(containerRef.value, {
      zoom: 6,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
    renderRoute()
  }

  function renderPins() {
    markers.forEach((m) => map.remove(m))
    markers = []

    const allLocations = store.locations
    allLocations.forEach((loc) => {
      const color = loc.selected
        ? PIN_STATUS_COLORS.confirmed
        : PIN_STATUS_COLORS.suggested

      const marker = new window.AMap.Marker({
        position: [loc.lon, loc.lat],
        title: loc.name,
        label: {
          content: `<div style="background:${color};color:white;padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap">${loc.name}</div>`,
          direction: 'top',
        },
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })
  }

  function renderRoute() {
    if (polyline) {
      map.remove(polyline)
    }

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return

    const path = confirmed.map((loc) => [loc.lon, loc.lat])

    polyline = new window.AMap.Polyline({
      path,
      strokeColor: '#3B82F6',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    })

    map.add(polyline)
    map.setFitView()
  }

  onMounted(() => {
    setTimeout(initMap, 100)
  })

  return { renderPins, renderRoute }
}
```

- [ ] **Step 3: Create MapPanel**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPins, renderRoute } = useMap(mapContainer)

const selectedLocation = ref(store.locations.find((l) => l.id === store.selectedLocationId))

function closeInfoCard() {
  store.setSelectedLocation(null)
}
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="mapContainer" class="h-full w-full" />
    <PinInfoCard
      v-if="store.selectedLocationId"
      :location="store.locations.find((l) => l.id === store.selectedLocationId)!"
      @close="closeInfoCard"
      @toggle="store.toggleLocation(store.selectedLocationId!)"
    />
  </div>
</template>
```

- [ ] **Step 4: Create PinInfoCard**

```vue
<script setup lang="ts">
import type { Location } from '@/types'
import { CATEGORY_LABELS } from '@/constants/categories'

const props = defineProps<{
  location: Location
}>()

const emit = defineEmits<{
  close: []
  toggle: []
}>()
</script>

<template>
  <div class="absolute bottom-4 left-4 right-4 rounded-xl bg-white p-4 shadow-lg z-10">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="text-lg font-semibold">{{ location.name }}</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {{ CATEGORY_LABELS[location.category] }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-600">{{ location.description }}</p>
      </div>
      <button
        class="ml-2 text-gray-400 hover:text-gray-600"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div class="mt-3 flex gap-2">
      <button
        :class="[
          'rounded-lg px-3 py-1.5 text-sm font-medium',
          location.selected
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
        @click="emit('toggle')"
      >
        {{ location.selected ? '已选中' : '添加到行程' }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/MapPanel/ src/composables/useMap.ts index.html
git commit -m "feat: create MapPanel with 高德地图, pins, and route polyline"
```

---

### Task 8: ItineraryStrip — Static Day Cards

**Covers:** [S4.3]

**Files:**
- Create: `src/components/ItineraryStrip/ItineraryStrip.vue`, `src/components/ItineraryStrip/DayCard.vue`, `src/components/ItineraryStrip/DriveTimeBar.vue`

- [ ] **Step 1: Create DriveTimeBar**

```vue
<script setup lang="ts">
const props = defineProps<{
  hours: number
  limit: number
}>()

const percentage = Math.min((props.hours / props.limit) * 100, 100)
const isOver = props.hours > props.limit
</script>

<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
    <div
      :class="['h-full rounded-full transition-all', isOver ? 'bg-red-500' : 'bg-blue-500']"
      :style="{ width: `${percentage}%` }"
    />
  </div>
  <div class="mt-1 flex justify-between text-xs text-gray-500">
    <span>{{ hours.toFixed(1) }}h</span>
    <span :class="isOver ? 'text-red-500 font-medium' : ''">
      {{ isOver ? '超出限制' : `/${limit}h` }}
    </span>
  </div>
</template>
```

- [ ] **Step 2: Create DayCard**

```vue
<script setup lang="ts">
import type { ItineraryDay } from '@/types'
import DriveTimeBar from './DriveTimeBar.vue'

const props = defineProps<{
  day: ItineraryDay
  drivingLimit: number
  isSelected: boolean
}>()

const emit = defineEmits<{
  select: [dayNumber: number]
}>()
</script>

<template>
  <div
    :class="[
      'flex-shrink-0 w-64 cursor-pointer rounded-xl border-2 p-4 transition-all',
      isSelected
        ? 'border-blue-500 bg-blue-50'
        : day.isOverLimit
          ? 'border-red-300 bg-red-50'
          : 'border-gray-200 bg-white hover:border-gray-300',
    ]"
    @click="emit('select', day.dayNumber)"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-800">Day {{ day.dayNumber }}</span>
      <span v-if="day.isOverLimit" class="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
        超限
      </span>
    </div>
    <p class="mt-1 text-xs text-gray-500">
      📍 {{ day.overnightLocation.shortName }}
    </p>
    <p class="mt-1 text-xs text-gray-500">
      🚗 {{ day.totalDistanceKm }}km · {{ day.stops.length }}个停靠点
    </p>
    <div class="mt-3">
      <DriveTimeBar :hours="day.totalDriveHours" :limit="drivingLimit" />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create ItineraryStrip**

```vue
<script setup lang="ts">
import { useTripStore } from '@/store/tripStore'
import DayCard from './DayCard.vue'

const store = useTripStore()

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="border-b border-gray-200 px-4 py-3">
      <h2 class="text-lg font-semibold text-gray-800">行程安排</h2>
      <p class="text-xs text-gray-500">
        {{ store.confirmedLocations.length }}个景点 · {{ store.itinerary.length }}天
      </p>
    </div>
    <div class="flex-1 overflow-x-auto overflow-y-hidden px-4 py-3">
      <div class="flex gap-3" style="min-width: max-content">
        <DayCard
          v-for="day in store.itinerary"
          :key="day.dayNumber"
          :day="day"
          :driving-limit="store.params.dailyDrivingLimitHours"
          :is-selected="store.selectedDay === day.dayNumber"
          @select="handleSelectDay"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ItineraryStrip/
git commit -m "feat: create ItineraryStrip with day cards and drive time bars"
```

---

### Task 9: Final Integration & Verification

**Covers:** [S1]

**Files:**
- Modify: `src/App.vue` (verify imports)

- [ ] **Step 1: Run dev server and verify**

```bash
npm run dev
```

Expected behavior:
- Three-panel layout visible (Chat left, Map center, Itinerary right)
- Chat shows 2 mock messages
- Map shows 4 pins with labels and a route polyline
- Itinerary shows 4 day cards, Day 4 marked as over-limit (red)

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx vue-tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify build succeeds**

```bash
npm run build
```

Expected: Build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 layout shell with static mock data"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** S1 (layout) → Task 5, 9. S2 (tech stack) → Task 1. S4 (modules) → Tasks 6, 7, 8. S5 (types) → Task 2. S6 (folder) → Tasks 1, 3. S7 (phases) → Task 4.
- [x] **Placeholder scan:** No TBDs or TODOs found.
- [x] **Type consistency:** All types defined in Task 2, used consistently in Tasks 4-8.

---

*End of Phase 1 plan. Ready for execution.*
