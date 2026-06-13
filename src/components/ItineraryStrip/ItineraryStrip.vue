<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTripStore, type RouteInfo } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import { geocodeAddress } from '@/services/poiSearch'
import {
  loadDistrictCache, searchDistrict, isDistrictCacheReady, onDistrictCacheChange
} from '@/services/amapDistrict'
import { getCurrentPosition as getGeoPosition } from '@/services/amapGeolocation'

const store = useTripStore()
const originInput = ref('')
const destinationInput = ref('')
const totalDays = ref(7)
const dailyDrivingLimit = ref(5)
const deviationDistance = ref(30)
const searchCount = ref(0)

// 地名匹配
const districtReady = ref(isDistrictCacheReady())
const districtBannerVisible = ref(!isDistrictCacheReady())
const districtNodeCount = ref(0)  // 缓存中的区划总数（用于诊断）
const lastSearchResult = ref(0)   // 最近一次搜索匹配数（用于诊断）
const lastSearchQuery = ref('')
const originSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const destSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)

const originValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const destValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const originLevel = ref<string>('')
const destLevel = ref<string>('')

// 流程
const stage = ref<'input' | 'confirmed'>('input')
const isConfirmed = computed(() => stage.value === 'confirmed')
const isEnteringPlanning = ref(false)
const enterError = ref<string | null>(null)
const isSwitchingStrategy = ref(false)

// 关键：进入规划按钮的可用条件 — 不依赖 originValid/destValid，只看 store 里的 lat
// （originValid/destValid 状态机过于复杂，容易卡在 'idle'）
const canEnterPlanning = computed(() => {
  return totalDays.value > 0 &&
    store.params.origin?.lat != null &&
    store.params.destination?.lat != null
})

onMounted(async () => {
  if (!districtReady.value) {
    try {
      const flat = await loadDistrictCache()
      districtReady.value = true
      districtNodeCount.value = Object.keys(flat.byName).length
      setTimeout(() => { districtBannerVisible.value = false }, 1800)
    } catch (e) {
      console.warn('District cache load failed:', e)
      districtBannerVisible.value = false
    }
  } else {
    // 已加载：取缓存统计
    const cached = localStorage.getItem('adcode_cache_v2')
    if (cached) {
      try {
        const flat = JSON.parse(cached)
        districtNodeCount.value = Object.keys(flat.byName || {}).length
      } catch {}
    }
  }
  onDistrictCacheChange((loaded) => {
    districtReady.value = loaded
    if (loaded) {
      const cached = localStorage.getItem('adcode_cache_v2')
      if (cached) {
        try { districtNodeCount.value = Object.keys(JSON.parse(cached).byName || {}).length } catch {}
      }
      setTimeout(() => { districtBannerVisible.value = false }, 1800)
    }
  })
})

// 输入联想
let originDebounce: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originDebounce) clearTimeout(originDebounce)
  originValid.value = 'idle'
  if (!val.trim()) {
    originSuggestions.value = []
    showOriginSuggestions.value = false
    return
  }
  originDebounce = setTimeout(() => {
    if (!districtReady.value) {
      showOriginSuggestions.value = true
      originSuggestions.value = []
      lastSearchResult.value = 0
      lastSearchQuery.value = val.trim()
      return
    }
    originSuggestions.value = searchDistrict(val.trim(), 8)
    lastSearchResult.value = originSuggestions.value.length
    lastSearchQuery.value = val.trim()
    showOriginSuggestions.value = true
  }, 150)
})

let destDebounce: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destDebounce) clearTimeout(destDebounce)
  destValid.value = 'idle'
  if (!val.trim()) {
    destSuggestions.value = []
    showDestSuggestions.value = false
    return
  }
  destDebounce = setTimeout(() => {
    if (!districtReady.value) {
      showDestSuggestions.value = true
      destSuggestions.value = []
      return
    }
    destSuggestions.value = searchDistrict(val.trim(), 8)
    showDestSuggestions.value = true
  }, 150)
})

// 焦点时主动触发下拉
function onOriginFocus() {
  const v = originInput.value.trim()
  if (!v) {
    showOriginSuggestions.value = false
    return
  }
  if (districtReady.value) {
    originSuggestions.value = searchDistrict(v, 8)
    lastSearchResult.value = originSuggestions.value.length
    lastSearchQuery.value = v
  } else {
    originSuggestions.value = []
  }
  showOriginSuggestions.value = true
}
function onDestFocus() {
  const v = destinationInput.value.trim()
  if (!v) {
    showDestSuggestions.value = false
    return
  }
  if (districtReady.value) {
    destSuggestions.value = searchDistrict(v, 8)
  } else {
    destSuggestions.value = []
  }
  showDestSuggestions.value = true
}

function selectOrigin(item: { name: string; adcode: string; center: [number, number]; level: string }) {
  originInput.value = item.name
  showOriginSuggestions.value = false
  originValid.value = 'valid'
  originLevel.value = item.level
  store.setOrigin({
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.name,
  })
}
function selectDest(item: { name: string; adcode: string; center: [number, number]; level: string }) {
  destinationInput.value = item.name
  showDestSuggestions.value = false
  destValid.value = 'valid'
  destLevel.value = item.level
  store.setDestination({
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.name,
  })
}

async function validateOrigin() {
  if (!originInput.value.trim()) return
  showOriginSuggestions.value = false
  // 已有精确 lat/lon（GPS / 选下拉）就跳过 geocode
  if (store.params.origin?.query === originInput.value.trim() && store.params.origin.lat != null) {
    originValid.value = 'valid'
    originLevel.value = 'selected'
    return
  }
  originValid.value = 'loading'
  const r = await geocodeAddress(originInput.value.trim())
  if (r) {
    originValid.value = 'valid'
    originLevel.value = r.level || ''
    store.setOrigin({
      query: originInput.value.trim(),
      lat: r.lat,
      lon: r.lon,
      shortName: originInput.value.trim(),
      fullName: originInput.value.trim(),
    })
  } else {
    originValid.value = 'invalid'
    originLevel.value = ''
  }
}
async function validateDest() {
  if (!destinationInput.value.trim()) return
  showDestSuggestions.value = false
  if (store.params.destination?.query === destinationInput.value.trim() && store.params.destination.lat != null) {
    destValid.value = 'valid'
    destLevel.value = 'selected'
    return
  }
  destValid.value = 'loading'
  const r = await geocodeAddress(destinationInput.value.trim())
  if (r) {
    destValid.value = 'valid'
    destLevel.value = r.level || ''
    store.setDestination({
      query: destinationInput.value.trim(),
      lat: r.lat,
      lon: r.lon,
      shortName: destinationInput.value.trim(),
      fullName: destinationInput.value.trim(),
    })
  } else {
    destValid.value = 'invalid'
    destLevel.value = ''
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
}

const isLocating = ref(false)
async function useMyLocation() {
  if (isLocating.value) return
  isLocating.value = true
  try {
    const pos = await getGeoPosition()
    const name = pos.district || pos.city || '当前位置'
    originInput.value = name
    originValid.value = 'valid'
    originLevel.value = 'gps'
    store.setOrigin({
      query: name,
      lat: pos.lat,
      lon: pos.lon,
      shortName: pos.city,
      fullName: pos.address,
    })
  } catch (e: any) {
    alert(`定位失败：${e?.message || '请手动输入起点'}\n（手机请开启定位权限，电脑可能因无 GPS 精度较低）`)
  } finally {
    isLocating.value = false
  }
}

function swapOriginDest() {
  const t = originInput.value
  originInput.value = destinationInput.value
  destinationInput.value = t
  const lt = originLevel.value
  originLevel.value = destLevel.value
  destLevel.value = lt
  const vt = originValid.value
  originValid.value = destValid.value
  destValid.value = vt
  const tp = store.params.origin
  store.setOrigin(store.params.destination)
  store.setDestination(tp)
}

// 点击已定位 chip → 地图聚焦
function focusOnOrigin() {
  const o = store.params.origin
  if (o && o.lat != null) {
    store.mapControls?.panTo(o.lon!, o.lat!, 12)
  }
}
function focusOnDest() {
  const d = store.params.destination
  if (d && d.lat != null) {
    store.mapControls?.panTo(d.lon!, d.lat!, 12)
  }
}

// 进入规划
async function handleEnterPlanning() {
  if (!canEnterPlanning.value) return
  isEnteringPlanning.value = true
  enterError.value = null
  try {
    store.params.totalDays = totalDays.value
    store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
    store.setMaxDeviation(deviationDistance.value)
    store.setCurrentStrategy(0)
    const o = store.params.origin!
    const d = store.params.destination!
    const routes = await store.prefetchRoutes(o, d, [0])
    if (routes.length > 0) {
      store.setRouteInfo(routes[0])
    }
    stage.value = 'confirmed'
    searchCount.value = 0
    await store.searchPoisByRoute()
  } catch (e: any) {
    enterError.value = e?.message || '进入规划失败'
  } finally {
    isEnteringPlanning.value = false
  }
}

function handleBackToForm() {
  stage.value = 'input'
  store.setRouteInfo(null)
  store.setAvailableRoutes([])
  store.setCurrentStrategy(0)
  searchCount.value = 0
}

async function handleStrategyClick(s: number) {
  if (s === store.currentStrategy) return
  isSwitchingStrategy.value = true
  try {
    store.setCurrentStrategy(s)
  } finally {
    setTimeout(() => { isSwitchingStrategy.value = false }, 1500)
  }
}

function handleSearch() {
  if (searchCount.value >= 3) return
  searchCount.value++
  store.searchPoisByRoute()
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m} m`
}
function formatDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
}
function formatKm(m?: number) {
  if (!m) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m} m`
}

const currentRouteInfo = computed<RouteInfo | null>(() => {
  if (store.routeInfo) return store.routeInfo
  return store.availableRoutes.find(r => r.strategy === store.currentStrategy) || null
})

const highwayRatio = computed(() => {
  const r = currentRouteInfo.value
  if (!r || !r.highwayDistance || !r.distance) return 0
  return Math.round((r.highwayDistance / r.distance) * 100)
})
</script>

<template>
  <div class="flex flex-col h-full" @click="closeSuggestions">
    <!-- 顶部 banner：地名数据状态 -->
    <div
      v-if="districtBannerVisible"
      class="flex-shrink-0 px-3 py-1.5 text-[11px] flex items-center gap-1.5 border-b"
      :class="districtReady ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'"
    >
      <span
        class="inline-block w-2.5 h-2.5 border-2 border-t-transparent rounded-full flex-shrink-0"
        :class="districtReady ? 'border-green-500' : 'border-blue-500 animate-spin'"
      ></span>
      <span class="truncate">
        <template v-if="districtReady">✓ 地名就绪（{{ districtNodeCount }} 个区划）</template>
        <template v-else>加载全国地名数据...</template>
      </span>
    </div>

    <!-- 标题栏 -->
    <div class="flex-shrink-0 border-b border-gray-100 px-3 py-2.5 bg-white flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-800">
        {{ isConfirmed ? '🛣️ 行程规划' : '🚗 行程规划' }}
      </h2>
      <button
        v-if="isConfirmed"
        class="text-xs text-gray-500 hover:text-gray-700"
        @click.stop="handleBackToForm"
      >← 返回修改</button>
    </div>

    <!-- ========== 阶段 1: 输入 ========== -->
    <div v-if="stage === 'input'" class="flex-1 overflow-y-auto px-3 py-3 space-y-3 border-b border-gray-100">
      <!-- 起点/终点 -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <div class="flex flex-col items-center">
            <div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
            <div class="w-0.5 h-6 bg-gray-200"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          </div>
          <div class="flex-1 space-y-1.5 relative">
            <div class="flex gap-1.5">
              <div class="flex-1 relative">
                <input
                  v-model="originInput"
                  placeholder="起点"
                  class="w-full px-2 py-1.5 text-xs border rounded focus:outline-none pr-14"
                  :class="originValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                  @click.stop
                  @input.stop
                  @focus="onOriginFocus"
                  @blur="validateOrigin"
                />
                <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <span v-if="originValid === 'loading'" class="inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                  <span v-else-if="originValid === 'valid'" class="text-green-500 text-[10px]">✓</span>
                  <span v-else-if="originValid === 'invalid'" class="text-red-500 text-[10px]">⚠</span>
                  <button
                    class="text-gray-400 hover:text-blue-500 disabled:opacity-50 text-xs"
                    :disabled="isLocating"
                    @click.stop="useMyLocation"
                    :title="isLocating ? '定位中...' : '使用当前位置'"
                  >{{ isLocating ? '⌛' : '📍' }}</button>
                </div>
                <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-44 overflow-y-auto">
                  <div v-if="!districtReady" class="px-2 py-1.5 text-xs text-blue-500 flex items-center gap-1.5">
                    <span class="inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                    加载中...
                  </div>
                  <div v-else-if="originSuggestions.length === 0" class="px-2 py-1.5 text-xs text-gray-400">
                    无匹配区划（下拉只显示省/市/区；输完后失焦自动 geocode 验证 POI）
                  </div>
                  <div
                    v-for="s in originSuggestions"
                    :key="s.adcode"
                    class="px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    @mousedown.prevent.stop="selectOrigin(s)"
                  >
                    <span class="font-medium">{{ s.name }}</span>
                    <span class="text-[10px] text-gray-400 ml-1">
                      {{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}
                    </span>
                  </div>
                </div>
              </div>
              <button class="px-1.5 py-1.5 text-gray-400 hover:text-gray-600 border border-gray-300 rounded text-xs" @click.stop="swapOriginDest" title="互换">⇅</button>
              <div class="flex-1 relative">
                <input
                  v-model="destinationInput"
                  placeholder="终点"
                  class="w-full px-2 py-1.5 text-xs border rounded focus:outline-none pr-6"
                  :class="destValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                  @click.stop
                  @input.stop
                  @focus="onDestFocus"
                  @blur="validateDest"
                />
                <span v-if="destValid === 'loading'" class="absolute right-1.5 top-1/2 -translate-y-1/2 inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                <span v-else-if="destValid === 'valid'" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-green-500 text-[10px]">✓</span>
                <span v-else-if="destValid === 'invalid'" class="absolute right-1.5 top-1/2 -translate-y-1/2 text-red-500 text-[10px]">⚠</span>
                <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-44 overflow-y-auto">
                  <div v-if="!districtReady" class="px-2 py-1.5 text-xs text-blue-500 flex items-center gap-1.5">
                    <span class="inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                    加载中...
                  </div>
                  <div v-else-if="destSuggestions.length === 0" class="px-2 py-1.5 text-xs text-gray-400">
                    无匹配区划
                  </div>
                  <div
                    v-for="s in destSuggestions"
                    :key="s.adcode"
                    class="px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    @mousedown.prevent.stop="selectDest(s)"
                  >
                    <span class="font-medium">{{ s.name }}</span>
                    <span class="text-[10px] text-gray-400 ml-1">
                      {{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <!-- 点击聚焦的 chip -->
            <div
              v-if="store.params.origin?.lat != null"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 cursor-pointer hover:bg-blue-100"
              @click.stop="focusOnOrigin"
              :title="`点击聚焦 ${store.params.origin.shortName} 到地图`"
            >
              📍 起点：{{ store.params.origin.shortName }}
              <span v-if="originLevel === 'city'" class="text-yellow-600">⚠市级</span>
              <span v-else-if="originLevel === 'gps'" class="text-green-600">·GPS</span>
            </div>
            <div
              v-if="store.params.destination?.lat != null"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-600 cursor-pointer hover:bg-red-100 ml-1"
              @click.stop="focusOnDest"
              :title="`点击聚焦 ${store.params.destination.shortName} 到地图`"
            >
              📍 终点：{{ store.params.destination.shortName }}
              <span v-if="destLevel === 'city'" class="text-yellow-600">⚠市级</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 旅行参数 -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-[10px] text-gray-400 mb-0.5 block">旅行天数</label>
          <div class="flex items-center gap-1">
            <input v-model.number="totalDays" type="number" min="1" max="30" class="w-14 px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            <span class="text-[10px] text-gray-500">天</span>
          </div>
        </div>
        <div>
          <label class="text-[10px] text-gray-400 mb-0.5 block">每日驾驶上限</label>
          <div class="flex items-center gap-1">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1 h-4" />
            <span class="text-[10px] font-medium text-blue-600 w-7 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <!-- 进入规划按钮 -->
      <button
        :disabled="!canEnterPlanning || isEnteringPlanning"
        class="w-full py-2 rounded text-xs font-medium flex items-center justify-center gap-1.5"
        :class="canEnterPlanning && !isEnteringPlanning ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400'"
        @click="handleEnterPlanning"
      >
        <template v-if="isEnteringPlanning">
          <span class="inline-block animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
          计算中...
        </template>
        <template v-else>
          进入规划 →
        </template>
      </button>
      <p v-if="enterError" class="text-[10px] text-red-500 text-center">{{ enterError }}</p>
    </div>

    <!-- ========== 阶段 2: 路线 + 策略 ========== -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-3 py-2.5 border-b border-gray-100 bg-gradient-to-br from-blue-50/30 to-white space-y-2">
      <!-- 顶部：当前策略 + 关键数据 -->
      <div v-if="currentRouteInfo">
        <div class="flex items-center gap-1.5 mb-1.5">
          <span class="text-sm font-semibold text-gray-800">
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.icon }}
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.label }}
            <span v-if="isSwitchingStrategy" class="ml-1 inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full align-middle"></span>
          </span>
        </div>
        <!-- 距离/时长 紧凑展示 -->
        <div class="grid grid-cols-2 gap-1.5 mb-1.5">
          <div class="bg-white rounded p-1.5 text-center">
            <p class="text-sm font-semibold text-blue-600 leading-none">{{ formatDistance(currentRouteInfo.distance) }}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">距离</p>
          </div>
          <div class="bg-white rounded p-1.5 text-center">
            <p class="text-sm font-semibold text-blue-600 leading-none">{{ formatDuration(currentRouteInfo.duration) }}</p>
            <p class="text-[10px] text-gray-400 mt-0.5">时长</p>
          </div>
        </div>
        <!-- 决策辅助数据（紧凑 4 列） -->
        <div class="grid grid-cols-4 gap-1 bg-white rounded p-1.5">
          <div class="text-center">
            <p class="text-[11px] font-semibold text-gray-700 leading-none">{{ highwayRatio }}%</p>
            <p class="text-[9px] text-gray-400 mt-0.5">高速占比</p>
          </div>
          <div class="text-center">
            <p class="text-[11px] font-semibold text-gray-700 leading-none">{{ currentRouteInfo.tolls ? `¥${currentRouteInfo.tolls}` : '—' }}</p>
            <p class="text-[9px] text-gray-400 mt-0.5">收费</p>
          </div>
          <div class="text-center">
            <p class="text-[11px] font-semibold text-gray-700 leading-none">{{ currentRouteInfo.trafficLights ?? '—' }}</p>
            <p class="text-[9px] text-gray-400 mt-0.5">红绿灯</p>
          </div>
          <div class="text-center">
            <p class="text-[11px] font-semibold text-gray-700 leading-none">{{ formatKm(currentRouteInfo.tollDistance) }}</p>
            <p class="text-[9px] text-gray-400 mt-0.5">收费路</p>
          </div>
        </div>
        <!-- 主要道路 -->
        <p v-if="currentRouteInfo.mainRoads && currentRouteInfo.mainRoads.length > 0" class="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
          🛣️ {{ currentRouteInfo.mainRoads.slice(0, 4).join(' · ') }}<span v-if="currentRouteInfo.mainRoads.length > 4"> 等</span>
        </p>
      </div>
      <div v-else class="text-center py-2 text-[11px] text-gray-400">
        <span class="inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full mr-1 align-middle"></span>
        计算路线中...
      </div>

      <!-- 4 策略 inline 切换器（紧凑 4 列） -->
      <div>
        <p class="text-[10px] text-gray-500 mb-1">🛣️ 切换策略（自动重算 + 重搜景点）</p>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :title="s.desc"
            :disabled="isSwitchingStrategy"
            :class="[
              'px-1 py-1 rounded text-[10px] border transition-all',
              store.currentStrategy === s.value
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300',
              isSwitchingStrategy ? 'opacity-60 cursor-not-allowed' : '',
            ]"
            @click="handleStrategyClick(s.value)"
          >
            <div class="leading-none">{{ s.icon }}</div>
            <div class="mt-0.5 truncate">{{ s.label }}</div>
          </button>
        </div>
      </div>
    </div>

    <!-- ========== 搜索按钮 + 抽屉入口 ========== -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-3 py-2.5 border-b border-gray-100 space-y-2">
      <div class="grid grid-cols-2 gap-1.5">
        <button
          :disabled="store.isSearchingPois || searchCount >= 3"
          class="py-1.5 rounded text-xs font-medium"
          :class="searchCount >= 3 ? 'bg-gray-200 text-gray-500' : 'bg-blue-500 text-white hover:bg-blue-600'"
          @click.stop="handleSearch"
        >{{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '次数已用完' : '搜索沿途景点' }}</button>
        <button
          class="py-1.5 rounded text-xs font-medium bg-purple-500 text-white hover:bg-purple-600"
          @click.stop="store.setPoiDrawerOpen(true)"
        >📍 景点管理 →</button>
      </div>
      <p v-if="searchCount >= 3" class="text-[10px] text-red-500 text-center">搜索次数用完，可切换策略或返回修改</p>

      <div class="flex items-center gap-1.5">
        <span class="text-[10px] text-gray-400">偏离</span>
        <input v-model.number="deviationDistance" type="range" min="5" max="100" step="5" class="flex-1 h-3" />
        <span class="text-[10px] font-medium text-blue-600 w-12 text-right">±{{ deviationDistance }} km</span>
      </div>
    </div>

    <!-- 底部统计（候选 POI / 已选 简报） -->
    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-3 py-2 text-[10px] text-gray-500 space-y-1">
      <p v-if="store.candidatePois.length > 0">🗺️ 候选 <span class="font-semibold text-blue-600">{{ store.candidatePois.length }}</span> 个景点</p>
      <p v-if="store.selectedPois.length > 0">✅ 已选 <span class="font-semibold text-green-600">{{ store.selectedPois.length }}</span> 个</p>
      <p v-if="store.candidatePois.length === 0 && !store.isSearchingPois" class="text-gray-400 italic">点上方"搜索沿途景点"找 POI</p>
      <p v-if="store.isSearchingPois" class="text-blue-500 flex items-center gap-1">
        <span class="inline-block animate-spin w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full"></span>
        搜索中...
      </p>
    </div>
  </div>
</template>
