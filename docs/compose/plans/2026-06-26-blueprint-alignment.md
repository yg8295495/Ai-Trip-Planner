# 蓝图对齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将清理后的代码库对齐蓝图，实现完整的自驾游规划核心交互

**Architecture:** 三个 Store（routeStore/poiStore/chatStore）驱动所有状态，组件层只负责渲染和用户交互。路线计算走高德API，POI搜索走本地SQLite，AI顾问走被动提案机制。

**Tech Stack:** Vue 3 + Pinia + 高德 JS API 2.0 + FastAPI + SQLite + shadcn-vue + vue-draggable-plus

---

## 差距分析

| 蓝图功能 | 当前状态 | 需要做 |
|----------|---------|--------|
| 珍珠项链模型 | ✅ routeStore 完整 | — |
| 分天视图 DayCard | ❌ 不存在 | 新建 ItineraryStrip |
| 标签罗盘 | ✅ MapPanel 已有 | — |
| AI 军师面板 | ✅ ChatPanel 已有 | 接入路线上下文 |
| 起终点输入 + 策略切换 | ❌ 不存在 | 新建 TripInput 组件 |
| 微观雷达 | ⚠️ UI有，mock数据 | 接真实后端 |
| 高德导航二维码 | ❌ 不存在 | 新建 |
| 拖拽排序 | ❌ 依赖 ItineraryStrip | 随 ItineraryStrip 一起 |
| 路线计算 | ❌ routeStore 缺 computeRoutes | 新增 |
| 路线局部缝合 | ❌ 缺 splicePolylines | 新增 |
| 走廊缓冲区可视化 | ❌ 未渲染 | MapPanel 加 polyline 缓冲 |
| AI 时空上下文注入 | ❌ ChatPanel 未接入 | 改 ChatPanel |
| 一键加入行程 | ❌ 未实现 | 改 ChatPanel Markdown |

---

## 文件结构

```
src/
├── stores/
│   ├── routeStore.ts      # 修改：加 computeRoutes + splicePolylines
│   ├── poiStore.ts         # 不动
│   └── chatStore.ts        # 不动
├── components/
│   ├── TripInput/          # 新建：起终点输入 + 策略选择
│   │   └── TripInput.vue
│   ├── ItineraryStrip/     # 新建：分天视图 + 拖拽 + QR码
│   │   └── ItineraryStrip.vue
│   ├── MicroRadar.vue      # 修改：接真实后端
│   ├── ChatPanel/          # 修改：接入路线上下文
│   │   └── ChatPanel.vue
│   ├── MapPanel/           # 修改：加走廊可视化
│   │   └── MapPanel.vue
│   └── ui/                 # 不动
├── services/
│   └── routeScheduler.ts   # 新建：高德路线计算
└── App.vue                 # 修改：整合新组件
```

---

## Task 1: 路线计算服务

**Covers:** 蓝图§2.2 后端性能边界、§5 珍珠项链

**Files:**
- Create: `src/services/routeScheduler.ts`

- [ ] **Step 1: 创建路线计算服务**

```typescript
// src/services/routeScheduler.ts
const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export interface RouteResult {
  distance: number
  duration: number
  polyline: [number, number][]
  strategy: number
  tolls?: number
  trafficLights?: number
  mainRoads?: string[]
}

export async function computeRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  strategy: number = 2,
  waypoints: { lat: number; lon: number }[] = []
): Promise<RouteResult[]> {
  const originLoc = `${origin.lon},${origin.lat}`
  const destLoc = `${destination.lon},${destination.lat}`

  let url = `https://restapi.amap.com/v3/direction/driving?` +
    `origin=${originLoc}&destination=${destLoc}&key=${AMAP_KEY}&extensions=all&strategy=${strategy}`

  if (waypoints.length > 0) {
    const pts = waypoints.map(w => `${w.lon},${w.lat}`).join('|')
    url += `&waypoints=${pts}`
  }

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== '1' || !data.route?.paths?.length) return []

  return data.route.paths.map((path: any) => {
    const polyline: [number, number][] = []
    const mainRoadsSet = new Set<string>()
    let highwayDistance = 0

    path.steps.forEach((step: any) => {
      if (step.polyline) {
        step.polyline.split(';').forEach((point: string) => {
          const [lng, lat] = point.split(',').map(Number)
          polyline.push([lng, lat])
        })
      }
      if (step.road && /高速|高架|快速路/.test(step.road) && step.distance) {
        highwayDistance += Number(step.distance)
        if (step.road.length >= 3 && step.road.length <= 12) mainRoadsSet.add(step.road)
      } else if (step.road && /[GH]?\d{1,3}|国道|省道/.test(step.road) && step.road.length <= 12) {
        mainRoadsSet.add(step.road)
      }
    })

    return {
      distance: Number(path.distance),
      duration: Number(path.duration),
      polyline,
      strategy,
      tolls: path.tolls ? Number(path.tolls) : undefined,
      trafficLights: path.traffic_lights != null ? Number(path.traffic_lights) : undefined,
      mainRoads: Array.from(mainRoadsSet).slice(0, 8)
    }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/routeScheduler.ts
git commit -m "feat: add route calculation service via Gaode API"
```

---

## Task 2: routeStore 补全路线计算

**Covers:** 蓝图§5.1 时间动态塌陷、§5.2 高德导航导出

**Files:**
- Modify: `src/stores/routeStore.ts`

- [ ] **Step 1: 在 routeStore 中加入 computeRoute 和策略切换**

在 `searchPoisByRoute` 函数之前添加：

```typescript
import { computeRoute, type RouteResult } from '@/services/routeScheduler'

// 在 routeInfo ref 之后添加：
const availableRoutes = ref<RouteResult[]>([])

// 添加计算路线方法：
async function computeAndSetRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  strategy: number = 2
) {
  isComputingRoute.value = true
  try {
    const routes = await computeRoute(origin, destination, strategy)
    availableRoutes.value = routes
    if (routes.length > 0) {
      routeInfo.value = routes[0]
      globalStrategy.value = strategy
    }
  } catch (err) {
    console.error('[routeStore] computeRoute failed:', err)
  } finally {
    isComputingRoute.value = false
  }
}

function switchStrategy(strategy: number) {
  globalStrategy.value = strategy
  // 重新计算当前起终点
  // 由调用方负责传入起终点
}
```

在 return 中添加 `availableRoutes`, `computeAndSetRoute`, `switchStrategy`。

- [ ] **Step 2: Commit**

```bash
git add src/stores/routeStore.ts
git commit -m "feat: add computeAndSetRoute to routeStore"
```

---

## Task 3: TripInput 组件（起终点输入 + 策略选择）

**Covers:** 蓝图§7 前端核心面板

**Files:**
- Create: `src/components/TripInput/TripInput.vue`

- [ ] **Step 1: 创建起终点输入组件**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { useRouteStore } from '@/stores/routeStore'

const chatStore = useChatStore()
const routeStore = useRouteStore()

const originText = ref('')
const destText = ref('')
const isGeocoding = ref(false)

const strategies = [
  { value: 2, label: '高速优先', desc: '时间最短' },
  { value: 13, label: '不走高速', desc: '国道省道' },
  { value: 10, label: '智能推荐', desc: '综合考量' },
]
const selectedStrategy = ref(2)

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(`https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=c866b4e29221cbc714a4fc78060f23b7`)
    const data = await res.json()
    if (data.status === '1' && data.geocodes?.length) {
      const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
      return { lat, lon }
    }
  } catch {}
  return null
}

async function handlePlan() {
  if (!originText.value || !destText.value) return

  isGeocoding.value = true
  try {
    const origin = await geocodeAddress(originText.value)
    const dest = await geocodeAddress(destText.value)
    if (!origin || !dest) return

    chatStore.params.origin = {
      lat: origin.lat, lon: origin.lon,
      name: originText.value, shortName: originText.value,
      formattedAddress: '', adcode: '', level: '',
      province: '', city: '', district: ''
    }
    chatStore.params.destination = {
      lat: dest.lat, lon: dest.lon,
      name: destText.value, shortName: destText.value,
      formattedAddress: '', adcode: '', level: '',
      province: '', city: '', district: ''
    }

    await routeStore.computeAndSetRoute(origin, dest, selectedStrategy.value)
  } finally {
    isGeocoding.value = false
  }
}
</script>

<template>
  <div class="p-4 space-y-4 border-b" style="border-color: var(--color-border)">
    <div class="space-y-2">
      <input
        v-model="originText"
        placeholder="起点（如：成都）"
        class="w-full px-3 py-2 text-sm rounded-lg border bg-background"
        style="border-color: var(--color-border)"
      />
      <input
        v-model="destText"
        placeholder="终点（如：康定）"
        class="w-full px-3 py-2 text-sm rounded-lg border bg-background"
        style="border-color: var(--color-border)"
      />
    </div>

    <div class="flex gap-2">
      <button
        v-for="s in strategies"
        :key="s.value"
        class="flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all"
        :class="selectedStrategy === s.value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background border-border hover:bg-muted'"
        @click="selectedStrategy = s.value"
      >
        {{ s.label }}
      </button>
    </div>

    <Button
      class="w-full"
      :disabled="!originText || !destText || isGeocoding"
      @click="handlePlan"
    >
      {{ isGeocoding ? '规划中...' : '开始规划' }}
    </Button>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TripInput/
git commit -m "feat: add TripInput component with origin/destination and strategy"
```

---

## Task 4: ItineraryStrip 组件（分天视图 + 拖拽 + QR码）

**Covers:** 蓝图§5 珍珠项链、§5.2 高德导航导出

**Files:**
- Create: `src/components/ItineraryStrip/ItineraryStrip.vue`

- [ ] **Step 1: 创建分天视图组件**

这个组件较复杂，分步骤实现：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useRouteStore } from '@/stores/routeStore'
import { Button } from '@/components/ui/button'

const routeStore = useRouteStore()

const activeDay = ref(0)

const dayTabs = computed(() => {
  return routeStore.routeByDays.map((day, i) => ({
    index: i,
    label: `Day ${i + 1}`,
    count: day.length,
    totalHours: day.reduce((sum, wp) => {
      // 简化计算：每个waypoint按1.5小时估算
      return sum + 1.5
    }, 0)
  }))
})

const currentDayWaypoints = computed(() => {
  return routeStore.routeByDays[activeDay.value] || []
})

function handleDragEnd() {
  // 拖拽完成后更新顺序
  routeStore.reorderWaypoints([...routeStore.waypoints])
}

function generateQrData() {
  const day = routeStore.routeByDays[activeDay.value]
  if (!day || day.length < 2) return ''

  const first = day[0].poi_details
  const last = day[day.length - 1].poi_details
  const waypoints = day.slice(1, -1).map(wp => ({
    name: wp.poi_details.name,
    lat: wp.poi_details.lat,
    lng: wp.poi_details.lng
  }))

  // 高德 Schema
  let uri = `amapuri://route/plan/?`
  uri += `dlat=${last.lat}&dlon=${last.lng}&dname=${encodeURIComponent(last.name)}`
  uri += `&slat=${first.lat}&slon=${first.lng}&sname=${encodeURIComponent(first.name)}`
  if (waypoints.length > 0) {
    const pts = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
    uri += `&dev=0&m=0`
  }
  return uri
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Day 标签 -->
    <div class="flex gap-1 p-2 overflow-x-auto border-b" style="border-color: var(--color-border)">
      <button
        v-for="tab in dayTabs"
        :key="tab.index"
        class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-all"
        :class="activeDay === tab.index
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted hover:bg-muted/80'"
        @click="activeDay = tab.index"
      >
        {{ tab.label }} ({{ tab.count }}点)
      </button>
    </div>

    <!-- 当天途经点列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <VueDraggable
        v-model="routeStore.waypoints"
        :group="{ name: 'waypoints' }"
        handle=".drag-handle"
        :animation="150"
        @end="handleDragEnd"
      >
        <div
          v-for="(wp, idx) in currentDayWaypoints"
          :key="wp.id"
          class="flex items-center gap-2 p-2 mb-1 rounded-lg border bg-card transition-all hover:shadow-sm"
          style="border-color: var(--color-border)"
        >
          <span class="drag-handle cursor-grab text-muted-foreground">⠿</span>
          <span class="text-sm font-medium flex-1 truncate">{{ wp.poi_details.name }}</span>
          <button
            class="text-xs px-2 py-0.5 rounded border transition-colors"
            :class="wp.isOvernight
              ? 'bg-amber-100 text-amber-700 border-amber-300'
              : 'bg-background border-border text-muted-foreground'"
            @click="routeStore.toggleOvernight(wp.id)"
          >
            {{ wp.isOvernight ? '宿' : '过夜' }}
          </button>
          <button
            class="text-xs text-destructive hover:text-destructive/80"
            @click="routeStore.removeWaypoint(wp.id)"
          >
            ✕
          </button>
        </div>
      </VueDraggable>

      <div v-if="currentDayWaypoints.length === 0" class="text-center text-muted-foreground text-sm py-8">
        点击地图上的景点加入行程
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="p-2 border-t flex gap-2" style="border-color: var(--color-border)">
      <Button variant="outline" size="sm" class="flex-1" @click="generateQrData">
        📱 导出导航
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ItineraryStrip/
git commit -m "feat: add ItineraryStrip with day view, drag sort, QR export"
```

---

## Task 5: MicroRadar 接入真实后端

**Covers:** 蓝图§4.3 分日精修、微观雷达

**Files:**
- Modify: `src/components/MicroRadar.vue`

- [ ] **Step 1: 修改 fireRadar 调用真实 API**

替换 `fireRadar` 函数：

```typescript
const fireRadar = async () => {
  radarState.value = 'expanded'
  try {
    // 获取当前视窗 bounds
    const bounds = poiStore.lastBounds
    if (!bounds) return

    // 扩展 bounds 为偏离距离
    const km = searchRadius.value[0]
    const latOffset = km / 111
    const lngOffset = km / (111 * Math.cos(bounds.min_lat * Math.PI / 180))
    const expandedBounds = {
      min_lat: bounds.min_lat - latOffset,
      max_lat: bounds.max_lat + latOffset,
      min_lng: bounds.min_lng - lngOffset,
      max_lng: bounds.max_lng + lngOffset
    }

    // 调用 OSM 发现接口
    const params = new URLSearchParams({
      min_lat: expandedBounds.min_lat.toString(),
      max_lat: expandedBounds.max_lat.toString(),
      min_lng: expandedBounds.min_lng.toString(),
      max_lng: expandedBounds.max_lng.toString(),
      limit: '15'
    })
    const res = await fetch(`/api/pois/osm-discover?${params}`)
    const data = await res.json()

    // 按标签过滤
    const tagMap: Record<string, string[]> = {
      camp: ['camp_site'],
      water: ['water', 'stream', 'river'],
      photo: ['viewpoint', 'peak'],
      family: ['playground', 'park']
    }
    const allowedTags = selectedTags.value.flatMap(t => tagMap[t] || [])

    const filtered = (data.osm_pois || []).filter((poi: any) =>
      allowedTags.some(tag => poi.specific_tag?.includes(tag) || poi.primary_tag?.includes(tag))
    )

    resultCount.value = filtered.length
    poiStore.osmPois = filtered
    radarState.value = 'active'
  } catch (err) {
    console.error('[MicroRadar] search failed:', err)
    radarState.value = 'hint'
  }
}
```

在 `<script setup>` 中添加 `import { usePoiStore } from '@/stores/poiStore'` 和 `const poiStore = usePoiStore()`。

- [ ] **Step 2: Commit**

```bash
git add src/components/MicroRadar.vue
git commit -m "feat: connect MicroRadar to real OSM discover API"
```

---

## Task 6: App.vue 整合所有组件

**Covers:** 蓝图§7 前端核心面板布局

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: 重写 App.vue 三栏布局**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ChatPanel from './components/ChatPanel/ChatPanel.vue'
import MapPanel from './components/MapPanel/MapPanel.vue'
import TripInput from './components/TripInput/TripInput.vue'
import ItineraryStrip from './components/ItineraryStrip/ItineraryStrip.vue'

const windowWidth = ref(window.innerWidth)
const chatCollapsed = ref(false)
const itineraryCollapsed = ref(false)

const isMobile = computed(() => windowWidth.value < 768)

function handleResize() {
  windowWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))
</script>

<template>
  <!-- 桌面端：左聊天 + 中地图 + 右行程 -->
  <div v-if="!isMobile" class="h-screen w-screen flex overflow-hidden">
    <!-- 左侧：聊天 + 输入 -->
    <div
      class="flex-shrink-0 flex flex-col border-r transition-all duration-300"
      :class="chatCollapsed ? 'w-12' : 'w-[340px]'"
      style="border-color: var(--color-border); background: var(--color-surface)"
    >
      <template v-if="!chatCollapsed">
        <TripInput class="flex-shrink-0" />
        <ChatPanel class="flex-1 min-h-0" />
      </template>
      <button
        v-else
        class="w-full h-12 flex items-center justify-center hover:bg-black/5"
        @click="chatCollapsed = false"
      >💬</button>
    </div>

    <!-- 中间：地图 -->
    <div class="flex-1 min-w-0">
      <MapPanel />
    </div>

    <!-- 右侧：行程单 -->
    <div
      class="flex-shrink-0 border-l transition-all duration-300"
      :class="itineraryCollapsed ? 'w-12' : 'w-[280px]'"
      style="border-color: var(--color-border); background: var(--color-surface)"
    >
      <template v-if="!itineraryCollapsed">
        <ItineraryStrip class="h-full" />
      </template>
      <button
        v-else
        class="w-full h-12 flex items-center justify-center hover:bg-black/5"
        @click="itineraryCollapsed = false"
      >📋</button>
    </div>
  </div>

  <!-- 移动端：简化布局 -->
  <div v-else class="h-screen w-screen flex flex-col">
    <MapPanel class="flex-1" />
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/App.vue
git commit -m "feat: integrate TripInput, ItineraryStrip into App layout"
```

---

## Task 7: 清理调试日志

**Covers:** 代码质量

**Files:**
- Modify: `src/stores/poiStore.ts`
- Modify: `src/components/MapPanel/MapPanel.vue`

- [ ] **Step 1: 删除所有 console.log/debug 语句**

搜索并删除所有 `[DEBUG`、`console.log`、`console.warn` 中的调试输出。保留 `console.error` 用于错误处理。

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove debug console.log statements"
```

---

## 执行方式

**Inline 执行**（不用 Subagent，不用 TDD）。理由：
- 后端已 TDD 验证，前端是 UI 组件 + 状态联动，无复杂业务逻辑
- 7 个 Task 有依赖关系，不适合并行
- UI 组件适合浏览器手动验证

## 执行顺序

| 顺序 | Task | 依赖 | 预估时间 |
|------|------|------|---------|
| 1 | Task 1: 路线计算服务 | 无 | 5 min |
| 2 | Task 2: routeStore 补全 | Task 1 | 5 min |
| 3 | Task 3: TripInput 组件 | Task 2 | 10 min |
| 4 | Task 4: ItineraryStrip | Task 2 | 15 min |
| 5 | Task 5: MicroRadar 接入 | 无 | 5 min |
| 6 | Task 6: App.vue 整合 + 侧栏折叠 | Task 3+4 | 5 min |
| 7 | Task 7: 清理日志 | 无 | 2 min |

**总计：约 47 分钟**

---

## Task 6 补充：侧栏折叠功能

**Covers:** 用户体验优化

**交互流程：**
1. 打开页面 → 左栏展开（等用户输入起终点）
2. 点击"开始规划" → 左栏自动收起 → 地图最大化
3. 需要 AI 帮忙 → 点 💬 展开左栏
4. 右栏始终展开（行程管理需要随时看）

**实现要点：**
- 左栏收起后宽度 48px，只显示 💬 图标按钮
- 收起/展开用 CSS transition 300ms 平滑过渡
- "开始规划"按钮点击后自动收起左栏
- 右栏不设折叠（行程管理需要随时可见）

---

## 验证方式

1. `npm run dev` 启动前端
2. `cd backend && python3 main.py` 启动后端
3. 打开 `https://localhost:443`
4. 测试流程：
   - 输入起终点 → 点击"开始规划" → 地图显示路线
   - 点击标签罗盘 → Marker 按分类筛选
   - 点击景点 Marker → "加入行程" → 右侧行程单更新
   - 拖拽行程单节点 → 顺序改变
   - 勾选"过夜" → 分天视图自动切片
   - 点击"导出导航" → 生成 QR 码
   - 点击"扫描沿途小众驻点" → 微观雷达搜索 OSM 数据
