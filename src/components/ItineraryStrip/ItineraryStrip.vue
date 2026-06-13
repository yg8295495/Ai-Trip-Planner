<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTripStore, type RouteInfo } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import { geocodeAddress, type GeocodeResult } from '@/services/poiSearch'
import {
  loadDistrictCache, searchDistrict, isDistrictCacheReady, onDistrictCacheChange,
  getChildren, type DistrictItem
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
const districtNodeCount = ref(0)
const lastSearchResult = ref(0)
const lastSearchQuery = ref('')
const originSuggestions = ref<DistrictItem[]>([])
const destSuggestions = ref<DistrictItem[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)

// geocode 多结果候选（当本地缓存无匹配时，geocode 返回多个结果供用户选择）
const originGeocodeResults = ref<GeocodeResult[]>([])
const destGeocodeResults = ref<GeocodeResult[]>([])

// 级联选择状态
const originSelectedParent = ref<DistrictItem | null>(null)
const destSelectedParent = ref<DistrictItem | null>(null)

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

// 输入联想（本地缓存匹配）
let originDebounce: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originDebounce) clearTimeout(originDebounce)
  originValid.value = 'idle'
  originSelectedParent.value = null
  originGeocodeResults.value = []  // 清除 geocode 结果
  
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
    const results = searchDistrict(val.trim(), 8)
    originSuggestions.value = results
    // 有本地匹配就显示，没有就隐藏（等 blur/enter 时 geocode）
    showOriginSuggestions.value = results.length > 0
  }, 150)
})

let destDebounce: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destDebounce) clearTimeout(destDebounce)
  destValid.value = 'idle'
  destSelectedParent.value = null
  destGeocodeResults.value = []
  
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
    const results = searchDistrict(val.trim(), 8)
    destSuggestions.value = results
    showDestSuggestions.value = results.length > 0
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

function selectOrigin(item: DistrictItem) {
  // 市级 → 展开区县选择
  if (item.level === 'city') {
    const children = getChildren(item.adcode)
    if (children.length > 0) {
      originSelectedParent.value = item
      originSuggestions.value = children
      showOriginSuggestions.value = true
      return
    }
  }
  // 省级/区县级 → 直接确认
  confirmOrigin(item)
}

function confirmOrigin(item: DistrictItem) {
  originInput.value = item.name
  showOriginSuggestions.value = false
  originSelectedParent.value = null
  originValid.value = 'valid'
  originLevel.value = item.level
  store.setOrigin({
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.path,
  })
}

function selectDest(item: DistrictItem) {
  // 市级 → 展开区县选择
  if (item.level === 'city') {
    const children = getChildren(item.adcode)
    if (children.length > 0) {
      destSelectedParent.value = item
      destSuggestions.value = children
      showDestSuggestions.value = true
      return
    }
  }
  // 省级/区县级 → 直接确认
  confirmDest(item)
}

function confirmDest(item: DistrictItem) {
  destinationInput.value = item.name
  showDestSuggestions.value = false
  destSelectedParent.value = null
  destValid.value = 'valid'
  destLevel.value = item.level
  store.setDestination({
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.path,
  })
}

async function validateOrigin() {
  if (!originInput.value.trim()) return
  // 已有精确 lat/lon（GPS / 选下拉）就跳过 geocode
  if (store.params.origin?.query === originInput.value.trim() && store.params.origin.lat != null) {
    originValid.value = 'valid'
    originLevel.value = 'selected'
    return
  }
  originValid.value = 'loading'
  const results = await geocodeAddress(originInput.value.trim())
  if (!results || results.length === 0) {
    // 无匹配 → 显示提示
    originValid.value = 'invalid'
    originLevel.value = ''
    originGeocodeResults.value = []
    showOriginSuggestions.value = true
  } else if (results.length === 1) {
    // 唯一匹配 → 自动确认
    const r = results[0]
    originValid.value = 'valid'
    originLevel.value = r.level || ''
    originGeocodeResults.value = []
    showOriginSuggestions.value = false
    store.setOrigin({
      query: originInput.value.trim(),
      lat: r.lat,
      lon: r.lon,
      shortName: r.district || r.city || originInput.value.trim(),
      fullName: r.formattedAddress || originInput.value.trim(),
    })
  } else {
    // 多匹配 → 显示候选让用户选
    originValid.value = 'idle'
    originLevel.value = ''
    originGeocodeResults.value = results
    originSuggestions.value = []  // 清除本地缓存结果
    showOriginSuggestions.value = true
  }
}

async function validateDest() {
  if (!destinationInput.value.trim()) return
  if (store.params.destination?.query === destinationInput.value.trim() && store.params.destination.lat != null) {
    destValid.value = 'valid'
    destLevel.value = 'selected'
    return
  }
  destValid.value = 'loading'
  const results = await geocodeAddress(destinationInput.value.trim())
  if (!results || results.length === 0) {
    destValid.value = 'invalid'
    destLevel.value = ''
    destGeocodeResults.value = []
    showDestSuggestions.value = true
  } else if (results.length === 1) {
    const r = results[0]
    destValid.value = 'valid'
    destLevel.value = r.level || ''
    destGeocodeResults.value = []
    showDestSuggestions.value = false
    store.setDestination({
      query: destinationInput.value.trim(),
      lat: r.lat,
      lon: r.lon,
      shortName: r.district || r.city || destinationInput.value.trim(),
      fullName: r.formattedAddress || destinationInput.value.trim(),
    })
  } else {
    destValid.value = 'idle'
    destLevel.value = ''
    destGeocodeResults.value = results
    destSuggestions.value = []
    showDestSuggestions.value = true
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
  originGeocodeResults.value = []
  destGeocodeResults.value = []
}

// 从 geocode 多结果中选择一个
function selectOriginGeocode(r: GeocodeResult) {
  originInput.value = r.formattedAddress || originInput.value.trim()
  originValid.value = 'valid'
  originLevel.value = r.level || ''
  originGeocodeResults.value = []
  showOriginSuggestions.value = false
  store.setOrigin({
    query: originInput.value.trim(),
    lat: r.lat,
    lon: r.lon,
    shortName: r.district || r.city || originInput.value.trim(),
    fullName: r.formattedAddress || originInput.value.trim(),
  })
}

function selectDestGeocode(r: GeocodeResult) {
  destinationInput.value = r.formattedAddress || destinationInput.value.trim()
  destValid.value = 'valid'
  destLevel.value = r.level || ''
  destGeocodeResults.value = []
  showDestSuggestions.value = false
  store.setDestination({
    query: destinationInput.value.trim(),
    lat: r.lat,
    lon: r.lon,
    shortName: r.district || r.city || destinationInput.value.trim(),
    fullName: r.formattedAddress || destinationInput.value.trim(),
  })
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
    store.setCurrentStrategy(2)
    const o = store.params.origin!
    const d = store.params.destination!
    const routes = await store.computeRoutes(o, d, 2)
    if (routes.length > 0) {
      store.setRouteAlternatives(routes)
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
  store.setRouteAlternatives([])
  store.setCurrentStrategy(2)
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
    <div v-if="stage === 'input'" class="flex-1 overflow-y-auto px-4 py-4 space-y-5 border-b border-gray-100">
      <!-- 起点 -->
      <div>
        <label class="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
          起点
        </label>
        <div class="relative">
          <input
            v-model="originInput"
            placeholder="输入起点城市"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-10"
            :class="originValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
            @click.stop
            @focus="onOriginFocus"
            @blur="validateOrigin"
            @keyup.enter="validateOrigin"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span v-if="originValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
            <span v-else-if="originValid === 'valid'" class="text-green-500 text-xs">✓</span>
            <span v-else-if="originValid === 'invalid'" class="text-red-500 text-xs">⚠</span>
            <button
              class="text-gray-400 hover:text-blue-500 disabled:opacity-50 text-sm"
              :disabled="isLocating"
              @click.stop="useMyLocation"
              :title="isLocating ? '定位中...' : '使用当前位置'"
            >{{ isLocating ? '⌛' : '📍' }}</button>
          </div>
          <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-blue-500 flex items-center gap-1.5">
              <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
              加载中...
            </div>
            <div v-else-if="originGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-xs text-gray-400 bg-gray-50">🔍 找到以下匹配地点，请选择：</div>
              <div
                v-for="(r, idx) in originGeocodeResults"
                :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                @mousedown.prevent.stop="selectOriginGeocode(r)"
              >
                <span class="font-medium">{{ r.formattedAddress }}</span>
                <span class="text-xs text-gray-400 ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="originSuggestions.length === 0" class="px-3 py-2 text-xs text-gray-400">
              未找到匹配地点，请重新输入或在地图上精确选取
            </div>
            <div
              v-for="s in originSuggestions"
              :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
              @mousedown.prevent.stop="selectOrigin(s)"
            >
              <span class="font-medium">{{ s.path || s.name }}</span>
              <span class="text-xs text-gray-400 ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div
          v-if="store.params.origin?.lat != null"
          class="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-50 text-blue-600 cursor-pointer hover:bg-blue-100"
          @click.stop="focusOnOrigin"
          :title="`点击聚焦 ${store.params.origin.shortName} 到地图`"
        >
          📍 {{ store.params.origin.shortName }}
          <span v-if="originLevel === 'city'" class="text-yellow-600 text-[10px]">⚠市级</span>
          <span v-else-if="originLevel === 'gps'" class="text-green-600 text-[10px]">·GPS</span>
        </div>
      </div>

      <!-- 互换按钮 -->
      <div class="flex justify-center">
        <button class="px-3 py-1 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg text-xs" @click.stop="swapOriginDest" title="互换起终点">⇅ 互换</button>
      </div>

      <!-- 终点 -->
      <div>
        <label class="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
          终点
        </label>
        <div class="relative">
          <input
            v-model="destinationInput"
            placeholder="输入终点城市"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-8"
            :class="destValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
            @click.stop
            @focus="onDestFocus"
            @blur="validateDest"
            @keyup.enter="validateDest"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            <span v-if="destValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
            <span v-else-if="destValid === 'valid'" class="text-green-500 text-xs">✓</span>
            <span v-else-if="destValid === 'invalid'" class="text-red-500 text-xs">⚠</span>
          </div>
          <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-blue-500 flex items-center gap-1.5">
              <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
              加载中...
            </div>
            <div v-else-if="destGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-xs text-gray-400 bg-gray-50">🔍 找到以下匹配地点，请选择：</div>
              <div
                v-for="(r, idx) in destGeocodeResults"
                :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                @mousedown.prevent.stop="selectDestGeocode(r)"
              >
                <span class="font-medium">{{ r.formattedAddress }}</span>
                <span class="text-xs text-gray-400 ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="destSuggestions.length === 0" class="px-3 py-2 text-xs text-gray-400">
              未找到匹配地点，请重新输入或在地图上精确选取
            </div>
            <div
              v-for="s in destSuggestions"
              :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
              @mousedown.prevent.stop="selectDest(s)"
            >
              <span class="font-medium">{{ s.path || s.name }}</span>
              <span class="text-xs text-gray-400 ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div
          v-if="store.params.destination?.lat != null"
          class="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-50 text-red-600 cursor-pointer hover:bg-red-100"
          @click.stop="focusOnDest"
          :title="`点击聚焦 ${store.params.destination.shortName} 到地图`"
        >
          📍 {{ store.params.destination.shortName }}
          <span v-if="destLevel === 'city'" class="text-yellow-600 text-[10px]">⚠市级</span>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-gray-200"></div>

      <!-- 旅行参数 -->
      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1.5 block">旅行天数</label>
          <div class="flex items-center gap-2">
            <input v-model.number="totalDays" type="number" min="1" max="30" class="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" />
            <span class="text-sm text-gray-500">天</span>
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-gray-500 mb-1.5 block">每日驾驶上限</label>
          <div class="flex items-center gap-2">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1 h-5" />
            <span class="text-sm font-semibold text-blue-600 w-10 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <!-- 进入规划按钮 -->
      <button
        :disabled="!canEnterPlanning || isEnteringPlanning"
        class="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        :class="canEnterPlanning && !isEnteringPlanning ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md' : 'bg-gray-100 text-gray-400'"
        @click="handleEnterPlanning"
      >
        <template v-if="isEnteringPlanning">
          <span class="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
          计算路线中...
        </template>
        <template v-else>
          🗺️ 进入规划
        </template>
      </button>
      <p v-if="enterError" class="text-xs text-red-500 text-center">{{ enterError }}</p>
    </div>

    <!-- ========== 阶段 2: 路线 + 策略 ========== -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-4 border-b border-gray-100 bg-gradient-to-br from-blue-50/30 to-white space-y-4">
      <!-- 顶部：当前策略 + 关键数据 -->
      <div v-if="currentRouteInfo">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-base font-semibold text-gray-800">
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.icon }}
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.label }}
            <span v-if="isSwitchingStrategy" class="ml-1 inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full align-middle"></span>
          </span>
        </div>
        <!-- 距离/时长 展示 -->
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-lg font-bold text-blue-600 leading-none">{{ formatDistance(currentRouteInfo.distance) }}</p>
            <p class="text-xs text-gray-500 mt-1">总距离</p>
          </div>
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-lg font-bold text-blue-600 leading-none">{{ formatDuration(currentRouteInfo.duration) }}</p>
            <p class="text-xs text-gray-500 mt-1">预计时长</p>
          </div>
        </div>
        <!-- 决策辅助数据（2x2 布局） -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-base font-semibold text-gray-700 leading-none">{{ highwayRatio }}%</p>
            <p class="text-xs text-gray-500 mt-1">高速占比</p>
          </div>
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-base font-semibold text-gray-700 leading-none">{{ currentRouteInfo.tolls ? `¥${currentRouteInfo.tolls}` : '—' }}</p>
            <p class="text-xs text-gray-500 mt-1">过路费</p>
          </div>
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-base font-semibold text-gray-700 leading-none">{{ currentRouteInfo.trafficLights ?? '—' }}</p>
            <p class="text-xs text-gray-500 mt-1">红绿灯</p>
          </div>
          <div class="bg-white rounded-lg p-3 text-center shadow-sm">
            <p class="text-base font-semibold text-gray-700 leading-none">{{ formatKm(currentRouteInfo.tollDistance) }}</p>
            <p class="text-xs text-gray-500 mt-1">收费路段</p>
          </div>
        </div>
        <!-- 主要道路 -->
        <p v-if="currentRouteInfo.mainRoads && currentRouteInfo.mainRoads.length > 0" class="text-xs text-gray-500 mt-3 leading-relaxed">
          🛣️ {{ currentRouteInfo.mainRoads.slice(0, 4).join(' · ') }}<span v-if="currentRouteInfo.mainRoads.length > 4"> 等</span>
        </p>
      </div>
      <div v-else class="text-center py-4 text-sm text-gray-400">
        <span class="inline-block animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2 align-middle"></span>
        计算路线中...
      </div>

      <!-- 策略 inline 切换器 -->
      <div>
        <p class="text-xs text-gray-500 mb-2">🛣️ 切换策略（自动重算路线）</p>
        <div class="flex gap-2">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :title="s.desc"
            :disabled="isSwitchingStrategy"
            :class="[
              'flex-1 px-2 py-2.5 rounded-lg text-xs border transition-all flex flex-col items-center gap-1',
              store.currentStrategy === s.value
                ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300',
              isSwitchingStrategy ? 'opacity-60 cursor-not-allowed' : '',
            ]"
            @click="handleStrategyClick(s.value)"
          >
            <span class="text-base">{{ s.icon }}</span>
            <span class="font-medium leading-tight text-center">{{ s.label }}</span>
          </button>
        </div>
      </div>

      <!-- 多条备选路线（10/13 策略返回多条时展示） -->
      <div v-if="store.routeAlternatives.length > 1" class="space-y-1.5">
        <p class="text-xs text-gray-500">📋 备选路线（点击切换）</p>
        <div
          v-for="(alt, idx) in store.routeAlternatives"
          :key="idx"
          class="p-2 rounded-lg border cursor-pointer transition-all text-xs"
          :class="store.routeInfo?.distance === alt.distance && store.routeInfo?.duration === alt.duration
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-blue-300'"
          @click="store.selectAlternative(idx)"
        >
          <div class="flex justify-between items-center">
            <span class="font-medium">路线 {{ idx + 1 }}</span>
            <span class="text-blue-600 font-semibold">{{ formatDistance(alt.distance) }}</span>
          </div>
          <div class="flex justify-between text-gray-500 mt-0.5">
            <span>{{ formatDuration(alt.duration) }}</span>
            <span>{{ alt.tolls ? `¥${alt.tolls}` : '免费' }}</span>
          </div>
          <p v-if="alt.mainRoads && alt.mainRoads.length > 0" class="text-[10px] text-gray-400 mt-1 truncate">
            {{ alt.mainRoads.slice(0, 3).join(' · ') }}
          </p>
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
