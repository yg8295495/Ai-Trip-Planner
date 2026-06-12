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
const originSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const destSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const customSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)
const showCustomSuggestions = ref(false)

const originValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const destValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const originLevel = ref<string>('')  // city/district/province - 来自 geocode
const destLevel = ref<string>('')

// 策略预览：4 策略分别计算，结果存这里
const previewRoutes = ref<RouteInfo[]>([])
const isPreviewingStrategies = ref(false)
const previewError = ref<string | null>(null)

// 流程阶段
const stage = ref<'input' | 'preview' | 'confirmed'>('input')
const isConfirmed = computed(() => stage.value === 'confirmed')

// 表单是否可"预览线路"
const canPreview = computed(() => {
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
    } catch (e) {
      console.warn('District cache load failed:', e)
    }
  }
  onDistrictCacheChange((loaded) => {
    districtReady.value = loaded
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
    showOriginSuggestions.value = originSuggestions.value.length > 0
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
    showDestSuggestions.value = destSuggestions.value.length > 0
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
    showCustomSuggestions.value = customSuggestions.value.length > 0
  }, 200)
})

// ============ 选中下拉项 ============
function selectOrigin(item: { name: string; adcode: string; center: [number, number]; level: string }) {
  originInput.value = item.name
  showOriginSuggestions.value = false
  originValid.value = 'valid'
  originLevel.value = item.level
  store.setOrigin({
    query: item.name,
    lat: item.center[1],  // center: [lng, lat]
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
  // 如果 store 里已有精确 lat/lon（之前选过下拉或定位），不再 geocode
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
      shortName: r.level === '城市' || r.level === '市' ? originInput.value.trim() : originInput.value.trim(),
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

// ============ 策略预览 ============
async function handlePreviewStrategies() {
  if (!canPreview.value) return
  store.params.totalDays = totalDays.value
  store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
  store.setMaxDeviation(deviationDistance.value)
  isPreviewingStrategies.value = true
  previewError.value = null
  previewRoutes.value = []
  stage.value = 'preview'
  try {
    const o = store.params.origin!
    const d = store.params.destination!
    const result = await store.prefetchRoutes(o, d, [0, 1, 3, 7])
    previewRoutes.value = result
    if (result.length === 0) previewError.value = '未取到任何路线'
  } catch (e: any) {
    previewError.value = e?.message || '计算失败'
  } finally {
    isPreviewingStrategies.value = false
  }
}

function selectStrategy(route: RouteInfo) {
  store.setCurrentStrategy(route.strategy)
  store.setRouteInfo(route)
  stage.value = 'confirmed'
  searchCount.value = 0
}

function handleBackToForm() {
  stage.value = 'input'
  store.setRouteInfo(null)
  store.setAvailableRoutes([])
  previewRoutes.value = []
  store.setCurrentStrategy(0)
  searchCount.value = 0
}

function handleBackToPreview() {
  stage.value = 'preview'
  store.setRouteInfo(null)
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
</script>

<template>
  <div class="flex flex-col h-full" @click="closeSuggestions">
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">行程规划</h2>
        <div class="flex gap-2">
          <button v-if="stage === 'preview'" class="text-sm text-gray-500 hover:text-gray-700" @click.stop="handleBackToForm">← 重选地点</button>
          <button v-if="isConfirmed" class="text-sm text-blue-500 hover:text-blue-700" @click.stop="handleBackToPreview">← 重新选策略</button>
        </div>
      </div>
    </div>

    <!-- ========== 阶段 1: 表单输入 ========== -->
    <div v-if="stage === 'input'" class="flex-shrink-0 px-4 py-4 border-b border-gray-100 space-y-4 overflow-y-auto">
      <!-- 地名数据加载中提示 -->
      <div v-if="!districtReady" class="text-xs text-gray-400 flex items-center gap-1.5">
        <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
        正在加载全国地名数据（仅 1 次，后续 0 调用）
      </div>

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
              <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-if="!districtReady" class="px-3 py-2 text-sm text-gray-400">加载地名数据中...</div>
                <div v-else-if="originSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配，输入完成后失焦将自动验证</div>
                <div v-for="s in originSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectOrigin(s)">
                  <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}</span></p>
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
                @blur="validateDest"
              />
              <span v-if="destValid === 'loading'" class="absolute right-2 top-1/2 -translate-y-1/2 inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
              <span v-else-if="destValid === 'valid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
              <span v-else-if="destValid === 'invalid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 text-xs">⚠</span>
              <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-if="!districtReady" class="px-3 py-2 text-sm text-gray-400">加载地名数据中...</div>
                <div v-else-if="destSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配，输入完成后失焦将自动验证</div>
                <div v-for="s in destSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectDest(s)">
                  <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}</span></p>
                </div>
              </div>
            </div>
          </div>
          <!-- 解析后的级别提示 -->
          <div v-if="originValid === 'valid' && originLevel" class="text-xs text-gray-500">
            📍 已定位：<span class="text-blue-600">{{ store.params.origin?.shortName || originInput }}</span>
            <span v-if="originLevel === '城市' || originLevel === 'city'" class="text-yellow-600"> · 市级坐标，可能不精确</span>
            <span v-else-if="originLevel === 'gps'" class="text-green-600"> · GPS</span>
          </div>
          <div v-if="destValid === 'valid' && destLevel" class="text-xs text-gray-500">
            📍 已定位：<span class="text-blue-600">{{ store.params.destination?.shortName || destinationInput }}</span>
            <span v-if="destLevel === '城市' || destLevel === 'city'" class="text-yellow-600"> · 市级坐标，可能不精确（建议在地图上点选）</span>
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

      <div>
        <label class="text-xs text-gray-400 mb-1 block">线路偏好（下一步预览可对比 4 种）</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :title="s.desc"
            class="px-2 py-1.5 rounded text-xs border border-gray-200 text-gray-600 hover:bg-gray-50"
          >{{ s.icon }} {{ s.label }}</button>
        </div>
      </div>

      <button
        :disabled="!canPreview"
        class="w-full py-2.5 rounded-lg text-sm font-medium"
        :class="canPreview ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400'"
        @click="handlePreviewStrategies"
      >
        下一步：预览 4 种线路 →
      </button>
    </div>

    <!-- ========== 阶段 2: 策略预览 ========== -->
    <div v-if="stage === 'preview'" class="flex-shrink-0 px-4 py-4 border-b border-gray-100">
      <p class="text-sm font-medium text-gray-700 mb-2">🛣️ 选择一种线路策略（已计算 4 条）</p>
      <p class="text-xs text-gray-400 mb-3">点击卡片可查看大图，再选一条作为主线</p>

      <div v-if="isPreviewingStrategies && previewRoutes.length === 0" class="text-center py-8">
        <div class="inline-block animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
        <p class="text-sm text-gray-500">正在计算 4 种策略路线...</p>
      </div>

      <div v-else-if="previewError" class="text-center py-6 text-sm text-red-500">
        {{ previewError }}
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="route in previewRoutes"
          :key="route.strategy"
          :class="[
            'p-3 rounded-lg border-2 cursor-pointer transition-colors',
            store.currentStrategy === route.strategy
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-blue-300',
          ]"
          @click="selectStrategy(route)"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">
              {{ ROUTE_STRATEGIES.find(s => s.value === route.strategy)?.icon || '🛣️' }}
            </span>
            <span class="text-sm font-semibold text-gray-800">
              {{ ROUTE_STRATEGIES.find(s => s.value === route.strategy)?.label || `策略${route.strategy}` }}
            </span>
            <span v-if="store.currentStrategy === route.strategy" class="ml-auto text-blue-500 text-xs">✓ 已选</span>
          </div>
          <p class="text-xs text-gray-500 mb-2">
            {{ ROUTE_STRATEGIES.find(s => s.value === route.strategy)?.desc || '' }}
          </p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <p class="text-base font-semibold text-blue-600">{{ formatDistance(route.distance) }}</p>
              <p class="text-xs text-gray-400">距离</p>
            </div>
            <div>
              <p class="text-base font-semibold text-blue-600">{{ formatDuration(route.duration) }}</p>
              <p class="text-xs text-gray-400">时长</p>
            </div>
            <div>
              <p class="text-base font-semibold text-blue-600">{{ route.cities.length }}</p>
              <p class="text-xs text-gray-400">城市</p>
            </div>
          </div>
          <p v-if="route.cities.length > 0" class="text-xs text-gray-500 mt-2 truncate">
            途经：{{ route.cities.map(c => c.name).join(' → ') }}
          </p>
        </div>
      </div>
    </div>

    <!-- ========== 阶段 3: 已确认路线 ========== -->
    <div v-if="isConfirmed && store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700">
          {{ ROUTE_STRATEGIES.find(s => s.value === store.routeInfo!.strategy)?.icon }}
          {{ ROUTE_STRATEGIES.find(s => s.value === store.routeInfo!.strategy)?.label }}
        </span>
        <span class="text-xs text-gray-400">已确认</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ formatDistance(store.routeInfo.distance) }}</p>
          <p class="text-xs text-gray-400">距离</p>
        </div>
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ formatDuration(store.routeInfo.duration) }}</p>
          <p class="text-xs text-gray-400">时长</p>
        </div>
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ store.routeInfo.cities.length }}</p>
          <p class="text-xs text-gray-400">城市</p>
        </div>
      </div>
      <p v-if="store.routeInfo.cities.length > 0" class="text-xs text-gray-500 mt-2 truncate">
        途经：{{ store.routeInfo.cities.map(c => c.name).join(' → ') }}
      </p>
    </div>

    <WeatherPanel v-if="isConfirmed" />

    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <div class="flex gap-2">
        <input v-model="customLocationInput" placeholder="添加自定义地点..." class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" @keydown.enter="handleAddCustomLocation" @click.stop />
        <button :disabled="!customLocationInput.trim()" class="px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50" @click.stop="handleAddCustomLocation">添加</button>
      </div>
      <div v-if="showCustomSuggestions" class="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
        <div v-if="!districtReady" class="px-3 py-2 text-sm text-gray-400">加载地名数据中...</div>
        <div v-else-if="customSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配</div>
        <div v-for="s in customSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectCustomLocation(s)">
          <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : '' }}</span></p>
        </div>
      </div>
    </div>

    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="store.isSearchingPois" class="text-center py-8"><p class="text-sm text-gray-500">搜索中...</p></div>
      <div v-else-if="store.candidatePois.length === 0" class="text-center py-8 text-gray-400 text-sm">点击下方按钮搜索沿途景点</div>
      <div v-else>
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-gray-400">找到 {{ store.candidatePois.length }} 个景点</p>
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
      <p v-if="searchCount >= 3" class="text-xs text-red-500 mt-1 text-center">搜索次数已用完，重新搜索请返回修改路线</p>
    </div>
  </div>
</template>
