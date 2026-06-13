<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTripStore, type PoiInfo, type RouteInfo } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import { geocodeAddress } from '@/services/poiSearch'
import {
  loadDistrictCache, searchDistrict, isDistrictCacheReady, onDistrictCacheChange
} from '@/services/amapDistrict'
import { getCurrentPosition as getGeoPosition } from '@/services/amapGeolocation'
import WeatherPanel from './WeatherPanel.vue'

const store = useTripStore()
const originInput = ref('')
const destinationInput = ref('')
const totalDays = ref(7)
const dailyDrivingLimit = ref(5)
const deviationDistance = ref(30)
const searchCount = ref(0)
const customLocationInput = ref('')

// 地名匹配相关
const districtReady = ref(isDistrictCacheReady())
const districtBannerVisible = ref(!isDistrictCacheReady())   // 顶部 banner 持续显示
const originSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const destSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const customSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)
const showCustomSuggestions = ref(false)

const originValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const destValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const originLevel = ref<string>('')
const destLevel = ref<string>('')

// 流程阶段：直接 2 段，没有 preview 卡顿
const stage = ref<'input' | 'confirmed'>('input')
const isConfirmed = computed(() => stage.value === 'confirmed')

// 进入规划中的 loading 状态
const isEnteringPlanning = ref(false)
const enterError = ref<string | null>(null)

// 搜索途中状态
const isSwitchingStrategy = ref(false)

const canEnterPlanning = computed(() => {
  return originValid.value === 'valid' &&
    destValid.value === 'valid' &&
    totalDays.value > 0 &&
    store.params.origin?.lat != null &&
    store.params.destination?.lat != null
})

// 启动时预加载 + 订阅加载状态
onMounted(async () => {
  if (!districtReady.value) {
    try {
      await loadDistrictCache()
      districtReady.value = true
      // 完成后 1.8s 内保持 banner，给用户看的机会
      setTimeout(() => { districtBannerVisible.value = false }, 1800)
    } catch (e) {
      console.warn('District cache load failed:', e)
      districtBannerVisible.value = false
    }
  }
  onDistrictCacheChange((loaded) => {
    districtReady.value = loaded
    if (loaded) {
      setTimeout(() => { districtBannerVisible.value = false }, 1800)
    }
  })
})

// ============ 输入联想 ============
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
      return
    }
    originSuggestions.value = searchDistrict(val.trim(), 8)
    showOriginSuggestions.value = true   // 总是显示，让 "无匹配" 也可见
  }, 200)
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
  }, 200)
})

let customDebounce: ReturnType<typeof setTimeout> | null = null
watch(customLocationInput, (val) => {
  if (customDebounce) clearTimeout(customDebounce)
  if (!val.trim()) {
    customSuggestions.value = []
    showCustomSuggestions.value = false
    return
  }
  customDebounce = setTimeout(() => {
    if (!districtReady.value) {
      showCustomSuggestions.value = true
      customSuggestions.value = []
      return
    }
    customSuggestions.value = searchDistrict(val.trim(), 8)
    showCustomSuggestions.value = true
  }, 200)
})

// ============ 焦点时主动触发下拉 ============
function onOriginFocus() {
  const v = originInput.value.trim()
  if (!v) {
    showOriginSuggestions.value = false
    return
  }
  if (districtReady.value) {
    originSuggestions.value = searchDistrict(v, 8)
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

// ============ 选中下拉项 ============
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
function selectCustomLocation(item: { name: string; adcode: string; center: [number, number] }) {
  const p: PoiInfo = {
    id: `custom_${Date.now()}`,
    name: item.name,
    type: '自定义',
    typecode: '',
    address: '',
    location: `${item.center[0]},${item.center[1]}`,
    cityname: '',
    adname: '',
    rating: '',
    cost: '',
    photos: [],
    tel: '',
    tag: '',
  }
  store.addCandidatePoi(p)
  store.togglePoiSelection(p)
  customLocationInput.value = ''
  showCustomSuggestions.value = false
}

// ============ 失焦 geocode 验证 ============
async function validateOrigin() {
  if (!originInput.value.trim()) return
  showOriginSuggestions.value = false
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

// ============ 自定义地点 ============
async function handleAddCustomLocation() {
  if (!customLocationInput.value.trim()) return
  const coord = await geocodeAddress(customLocationInput.value.trim())
  if (coord) {
    const p: PoiInfo = {
      id: `custom_${Date.now()}`,
      name: customLocationInput.value.trim(),
      type: '自定义',
      typecode: '',
      address: '',
      location: `${coord.lon},${coord.lat}`,
      cityname: '',
      adname: '',
      rating: '',
      cost: '',
      photos: [],
      tel: '',
      tag: '',
    }
    store.addCandidatePoi(p)
    store.togglePoiSelection(p)
    customLocationInput.value = ''
  } else {
    alert('未找到该地点，请输入更具体的名称（建议先在左侧"起点/终点"中选城市，再具体到区/路）')
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
  showCustomSuggestions.value = false
}

// ============ 定位 ============
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

// ============ 进入规划（单页，删除 preview） ============
async function handleEnterPlanning() {
  if (!canEnterPlanning.value) return
  isEnteringPlanning.value = true
  enterError.value = null
  try {
    // 写入 store
    store.params.totalDays = totalDays.value
    store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
    store.setMaxDeviation(deviationDistance.value)
    // 默认策略 0（高速优先）
    store.setCurrentStrategy(0)
    const o = store.params.origin!
    const d = store.params.destination!
    // 计算默认策略路线（触发 MapPanel watch）
    const routes = await store.prefetchRoutes(o, d, [0])
    if (routes.length > 0) {
      store.setRouteInfo(routes[0])
    }
    // 切到 stage 2
    stage.value = 'confirmed'
    searchCount.value = 0
    // 自动搜 POI（基于默认策略 0 的多边形）
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

// ============ 策略切换（仅切 currentStrategy，MapPanel 自动重算+重搜） ============
async function handleStrategyClick(s: number) {
  if (s === store.currentStrategy) return
  isSwitchingStrategy.value = true
  try {
    store.setCurrentStrategy(s)
    // MapPanel watch currentStrategy 会自动 renderRouteByREST + searchPoisByRoute
    // 这里只是给用户视觉反馈：转圈
  } finally {
    // 1.5s 后取消 loading 状态（实际渲染可能更久/更短）
    setTimeout(() => { isSwitchingStrategy.value = false }, 1500)
  }
}

function handleSearch() {
  if (searchCount.value >= 3) return
  searchCount.value++
  store.searchPoisByRoute()
}

// 列表维护
function removePoi(poi: PoiInfo, e: Event) {
  e.stopPropagation()
  store.removeCandidatePoi(poi.id)
}
function movePoi(poi: PoiInfo, dir: 'up' | 'down', e: Event) {
  e.stopPropagation()
  store.moveSelectedPoi(poi.id, dir)
}
function clearAllPois() {
  if (confirm(`确认清空所有 ${store.candidatePois.length} 个景点？`)) {
    store.clearAllCandidatePois()
  }
}

function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m} m`
}
function formatDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}m`
}

// 从 availableRoutes 中找当前 strategy 的信息（如果存在）
const currentRouteInfo = computed<RouteInfo | null>(() => {
  if (store.routeInfo) return store.routeInfo
  return store.availableRoutes.find(r => r.strategy === store.currentStrategy) || null
})
</script>

<template>
  <div class="flex flex-col h-full" @click="closeSuggestions">
    <!-- 顶部持久 banner：加载地名数据状态 -->
    <div
      v-if="districtBannerVisible"
      class="flex-shrink-0 px-4 py-2 text-xs flex items-center gap-2 border-b transition-colors"
      :class="districtReady ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'"
    >
      <span
        class="inline-block w-3 h-3 border-2 border-t-transparent rounded-full"
        :class="districtReady ? 'border-green-500' : 'border-blue-500 animate-spin'"
      ></span>
      <span>
        <template v-if="districtReady">✓ 全国地名数据已就绪（共 {{ store.candidatePois.length === 0 ? '约 3000' : '' }} 个行政区划缓存）</template>
        <template v-else>正在加载全国地名数据（仅 1 次 API 调用，后续 0 消耗）...</template>
      </span>
    </div>

    <!-- 标题栏 -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">
          {{ isConfirmed ? '🛣️ 行程规划' : '🚗 行程规划' }}
        </h2>
        <div class="flex gap-2">
          <button v-if="isConfirmed" class="text-sm text-gray-500 hover:text-gray-700" @click.stop="handleBackToForm">← 返回修改</button>
        </div>
      </div>
    </div>

    <!-- ========== 阶段 1: 表单输入 ========== -->
    <div v-if="stage === 'input'" class="flex-shrink-0 px-4 py-4 border-b border-gray-100 space-y-4 overflow-y-auto">
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <div class="w-0.5 h-8 bg-gray-200"></div>
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div class="flex-1 space-y-2 relative">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                v-model="originInput"
                placeholder="起点（城市/区县）"
                class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-20"
                :class="originValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                @click.stop
                @input.stop
                @focus="onOriginFocus"
                @blur="validateOrigin"
              />
              <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span v-if="originValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                <span v-else-if="originValid === 'valid'" class="text-green-500 text-xs">✓</span>
                <span v-else-if="originValid === 'invalid'" class="text-red-500 text-xs">⚠</span>
                <button
                  class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-50"
                  :disabled="isLocating"
                  @click.stop="useMyLocation"
                  :title="isLocating ? '定位中...' : '使用当前位置'"
                >{{ isLocating ? '⌛' : '📍' }}</button>
              </div>
              <!-- 下拉 -->
              <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                <div v-if="!districtReady" class="px-3 py-2 text-sm text-blue-500 flex items-center gap-2">
                  <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                  正在加载地名数据...
                </div>
                <div v-else-if="originSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配，输入完成后失焦将自动验证坐标</div>
                <div v-for="s in originSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectOrigin(s)">
                  <p class="font-medium">
                    {{ s.name }}
                    <span class="text-xs text-gray-400 ml-1">
                      {{ s.level === 'city' ? '·市' : s.level === 'district' ? '·区/县' : s.level === 'province' ? '·省' : '' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <button class="px-2 py-2 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg" @click.stop="swapOriginDest" title="互换">⇅</button>
            <div class="flex-1 relative">
              <input
                v-model="destinationInput"
                placeholder="终点（城市/区县）"
                class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-7"
                :class="destValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                @click.stop
                @input.stop
                @focus="onDestFocus"
                @blur="validateDest"
              />
              <span v-if="destValid === 'loading'" class="absolute right-2 top-1/2 -translate-y-1/2 inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
              <span v-else-if="destValid === 'valid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
              <span v-else-if="destValid === 'invalid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 text-xs">⚠</span>
              <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                <div v-if="!districtReady" class="px-3 py-2 text-sm text-blue-500 flex items-center gap-2">
                  <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                  正在加载地名数据...
                </div>
                <div v-else-if="destSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配，输入完成后失焦将自动验证坐标</div>
                <div v-for="s in destSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectDest(s)">
                  <p class="font-medium">
                    {{ s.name }}
                    <span class="text-xs text-gray-400 ml-1">
                      {{ s.level === 'city' ? '·市' : s.level === 'district' ? '·区/县' : s.level === 'province' ? '·省' : '' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div v-if="originValid === 'valid' && originLevel" class="text-xs text-gray-500">
            📍 已定位：<span class="text-blue-600 font-medium">{{ store.params.origin?.shortName || originInput }}</span>
            <span v-if="originLevel === '城市' || originLevel === 'city'" class="text-yellow-600 ml-1">· 市级坐标，可能不精确</span>
            <span v-else-if="originLevel === 'gps'" class="text-green-600 ml-1">· GPS</span>
            <span v-else-if="originLevel === 'district'" class="text-blue-600 ml-1">· 区/县级</span>
            <span v-else-if="originLevel === 'selected'" class="text-green-600 ml-1">· 已选下拉</span>
          </div>
          <div v-if="destValid === 'valid' && destLevel" class="text-xs text-gray-500">
            📍 已定位：<span class="text-blue-600 font-medium">{{ store.params.destination?.shortName || destinationInput }}</span>
            <span v-if="destLevel === '城市' || destLevel === 'city'" class="text-yellow-600 ml-1">· 市级坐标，可能不精确（建议在地图上点选）</span>
            <span v-else-if="destLevel === 'district'" class="text-blue-600 ml-1">· 区/县级</span>
            <span v-else-if="destLevel === 'selected'" class="text-green-600 ml-1">· 已选下拉</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gray-400 mb-1 block">旅行天数</label>
          <div class="flex items-center gap-2">
            <input v-model.number="totalDays" type="number" min="1" max="30" class="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" />
            <span class="text-sm text-gray-500">天</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-400 mb-1 block">每日驾驶上限</label>
          <div class="flex items-center gap-2">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1" />
            <span class="text-sm font-medium text-blue-600 w-8 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <button
        :disabled="!canEnterPlanning || isEnteringPlanning"
        class="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
        :class="canEnterPlanning && !isEnteringPlanning ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400'"
        @click="handleEnterPlanning"
      >
        <template v-if="isEnteringPlanning">
          <span class="inline-block animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
          正在计算路线并搜索沿途景点...
        </template>
        <template v-else>
          进入规划 →
        </template>
      </button>
      <p v-if="enterError" class="text-xs text-red-500 text-center">{{ enterError }}</p>
    </div>

    <!-- ========== 阶段 2: 已确认路线（含 4 策略切换器） ========== -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-br from-blue-50/50 to-white">
      <!-- 顶部：当前路线信息 -->
      <div v-if="currentRouteInfo" class="mb-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base font-semibold text-gray-800">
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.icon }}
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.label }}
            <span v-if="isSwitchingStrategy" class="ml-1 inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full align-middle"></span>
          </span>
          <span class="ml-auto text-xs text-gray-400">已锁定路线</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-white rounded p-2">
            <p class="text-base font-semibold text-blue-600">{{ formatDistance(currentRouteInfo.distance) }}</p>
            <p class="text-xs text-gray-400">距离</p>
          </div>
          <div class="bg-white rounded p-2">
            <p class="text-base font-semibold text-blue-600">{{ formatDuration(currentRouteInfo.duration) }}</p>
            <p class="text-xs text-gray-400">时长</p>
          </div>
          <div class="bg-white rounded p-2">
            <p class="text-base font-semibold text-blue-600">{{ currentRouteInfo.cities.length }}</p>
            <p class="text-xs text-gray-400">途经城市</p>
          </div>
        </div>
        <p v-if="currentRouteInfo.cities.length > 0" class="text-xs text-gray-500 mt-2 truncate">
          途经：{{ currentRouteInfo.cities.map(c => c.name).join(' → ') }}
        </p>
      </div>
      <div v-else class="text-center py-3 text-sm text-gray-400">
        <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full mr-1 align-middle"></span>
        正在加载路线...
      </div>

      <!-- 4 策略 inline 切换器 -->
      <div class="mt-3">
        <p class="text-xs text-gray-500 mb-1.5">🛣️ 切换线路策略（点击下方 4 个标签，会自动重算路线 + 重搜沿途景点）</p>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :title="s.desc"
            :disabled="isSwitchingStrategy"
            :class="[
              'px-1.5 py-1.5 rounded text-xs border transition-all',
              store.currentStrategy === s.value
                ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50',
              isSwitchingStrategy ? 'opacity-60 cursor-not-allowed' : '',
            ]"
            @click="handleStrategyClick(s.value)"
          >
            <div class="text-base leading-none">{{ s.icon }}</div>
            <div class="mt-0.5 truncate">{{ s.label }}</div>
          </button>
        </div>
        <p v-if="store.currentStrategy === 0 && !isSwitchingStrategy" class="text-xs text-blue-500 mt-1">默认：高速优先（推荐先看这条）</p>
      </div>
    </div>

    <WeatherPanel v-if="isConfirmed" />

    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <div class="flex gap-2">
        <input v-model="customLocationInput" placeholder="添加自定义地点..." class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" @keydown.enter="handleAddCustomLocation" @click.stop />
        <button :disabled="!customLocationInput.trim()" class="px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50" @click.stop="handleAddCustomLocation">添加</button>
      </div>
      <div v-if="showCustomSuggestions" class="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
        <div v-if="!districtReady" class="px-3 py-2 text-sm text-blue-500 flex items-center gap-2">
          <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
          正在加载地名数据...
        </div>
        <div v-else-if="customSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配</div>
        <div v-for="s in customSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectCustomLocation(s)">
          <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '·市' : s.level === 'district' ? '·区/县' : '' }}</span></p>
        </div>
      </div>
    </div>

    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="store.isSearchingPois" class="text-center py-8">
        <span class="inline-block animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2 align-middle"></span>
        <span class="text-sm text-gray-500">正在搜索沿途景点...</span>
      </div>
      <div v-else-if="store.candidatePois.length === 0" class="text-center py-8 text-gray-400 text-sm">点击下方按钮搜索沿途景点</div>
      <div v-else>
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-gray-400">找到 {{ store.candidatePois.length }} 个景点（基于当前策略）</p>
          <button class="text-xs text-red-500 hover:text-red-700" @click="clearAllPois">清空</button>
        </div>
        <div class="space-y-2">
          <div
            v-for="(poi, idx) in store.candidatePois"
            :key="poi.id"
            :class="['p-3 rounded-lg border cursor-pointer', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white']"
            @click.stop="store.togglePoiSelection(poi)"
          >
            <div class="flex items-center gap-3">
              <div v-if="poi.photos && poi.photos.length > 0" class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                <img :src="poi.photos[0].url" class="w-full h-full object-cover" />
              </div>
              <div v-else class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">📷</div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-gray-800 truncate">{{ poi.name }}</span>
                <span v-if="poi.rating" class="text-xs text-yellow-600 ml-1">⭐{{ poi.rating }}</span>
                <p class="text-xs text-gray-500 truncate">{{ poi.cityname }} {{ poi.adname }}</p>
                <p v-if="poi.tag" class="text-xs text-blue-500 truncate">{{ poi.tag }}</p>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-500' : 'border-gray-300']">
                  <svg v-if="store.selectedPois.some(p => p.id === poi.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div v-if="store.selectedPois.some(p => p.id === poi.id)" class="flex flex-col gap-0.5">
                  <button :disabled="idx === 0" class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-30" @click="movePoi(poi, 'up', $event)" title="上移">▲</button>
                  <button :disabled="idx === store.candidatePois.length - 1" class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-30" @click="movePoi(poi, 'down', $event)" title="下移">▼</button>
                </div>
              </div>
              <button class="flex-shrink-0 w-6 h-6 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-base" @click="removePoi(poi, $event)" title="删除">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-400">偏离范围</span>
        <span class="text-xs font-medium text-blue-600">±{{ deviationDistance }} km</span>
      </div>
      <input v-model.number="deviationDistance" type="range" min="5" max="100" step="5" class="w-full mb-1" />
      <p class="text-xs text-gray-400 mb-2">📌 偏离范围 = 沿路线左右各 X km 内搜索，越大候选越多</p>
      <button
        :disabled="store.isSearchingPois || searchCount >= 3"
        class="w-full py-2.5 rounded-lg text-sm font-medium"
        :class="searchCount >= 3 ? 'bg-gray-300 text-gray-500' : 'bg-blue-500 text-white hover:bg-blue-600'"
        @click.stop="handleSearch"
      >{{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '搜索次数已用完' : '搜索沿途景点' }}</button>
      <p v-if="searchCount >= 3" class="text-xs text-red-500 mt-1 text-center">搜索次数已用完，可切换策略或返回修改</p>
    </div>
  </div>
</template>
