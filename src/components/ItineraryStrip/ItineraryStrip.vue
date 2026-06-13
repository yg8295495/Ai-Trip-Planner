<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
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

const districtReady = ref(isDistrictCacheReady())
const districtBannerVisible = ref(!isDistrictCacheReady())
const districtNodeCount = ref(0)
const lastSearchResult = ref(0)
const lastSearchQuery = ref('')
const originSuggestions = ref<DistrictItem[]>([])
const destSuggestions = ref<DistrictItem[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)

const originGeocodeResults = ref<GeocodeResult[]>([])
const destGeocodeResults = ref<GeocodeResult[]>([])

const originSelectedParent = ref<DistrictItem | null>(null)
const destSelectedParent = ref<DistrictItem | null>(null)

const originValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const destValid = ref<'idle' | 'loading' | 'valid' | 'invalid'>('idle')
const originLevel = ref<string>('')
const destLevel = ref<string>('')

const stage = ref<'input' | 'confirmed'>('input')
const isConfirmed = computed(() => stage.value === 'confirmed')
const isEnteringPlanning = ref(false)
const enterError = ref<string | null>(null)
const isSwitchingStrategy = ref(false)
const showAlternatives = ref(false)

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

let originDebounce: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originDebounce) clearTimeout(originDebounce)
  originValid.value = 'idle'
  originSelectedParent.value = null
  originGeocodeResults.value = []
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

function onOriginFocus() {
  const v = originInput.value.trim()
  if (!v) { showOriginSuggestions.value = false; return }
  if (districtReady.value) {
    originSuggestions.value = searchDistrict(v, 8)
    lastSearchResult.value = originSuggestions.value.length
    lastSearchQuery.value = v
  } else { originSuggestions.value = [] }
  showOriginSuggestions.value = true
}
function onDestFocus() {
  const v = destinationInput.value.trim()
  if (!v) { showDestSuggestions.value = false; return }
  if (districtReady.value) { destSuggestions.value = searchDistrict(v, 8) }
  else { destSuggestions.value = [] }
  showDestSuggestions.value = true
}

function selectOrigin(item: DistrictItem) {
  if (item.level === 'city') {
    const children = getChildren(item.adcode)
    if (children.length > 0) {
      originSelectedParent.value = item
      originSuggestions.value = children
      showOriginSuggestions.value = true
      return
    }
  }
  confirmOrigin(item)
}
function confirmOrigin(item: DistrictItem) {
  originInput.value = item.name
  showOriginSuggestions.value = false
  originSelectedParent.value = null
  originValid.value = 'valid'
  originLevel.value = item.level
  store.setOrigin({ query: item.name, lat: item.center[1], lon: item.center[0], shortName: item.name, fullName: item.path })
}
function selectDest(item: DistrictItem) {
  if (item.level === 'city') {
    const children = getChildren(item.adcode)
    if (children.length > 0) {
      destSelectedParent.value = item
      destSuggestions.value = children
      showDestSuggestions.value = true
      return
    }
  }
  confirmDest(item)
}
function confirmDest(item: DistrictItem) {
  destinationInput.value = item.name
  showDestSuggestions.value = false
  destSelectedParent.value = null
  destValid.value = 'valid'
  destLevel.value = item.level
  store.setDestination({ query: item.name, lat: item.center[1], lon: item.center[0], shortName: item.name, fullName: item.path })
}

async function validateOrigin() {
  if (!originInput.value.trim()) return
  if (store.params.origin?.query === originInput.value.trim() && store.params.origin.lat != null) {
    originValid.value = 'valid'; originLevel.value = 'selected'; return
  }
  originValid.value = 'loading'
  const results = await geocodeAddress(originInput.value.trim())
  if (!results || results.length === 0) {
    originValid.value = 'invalid'; originLevel.value = ''; originGeocodeResults.value = []; showOriginSuggestions.value = true
  } else if (results.length === 1) {
    const r = results[0]
    originValid.value = 'valid'; originLevel.value = r.level || ''; originGeocodeResults.value = []; showOriginSuggestions.value = false
    store.setOrigin({ query: originInput.value.trim(), lat: r.lat, lon: r.lon, shortName: r.district || r.city || originInput.value.trim(), fullName: r.formattedAddress || originInput.value.trim() })
  } else {
    originValid.value = 'idle'; originLevel.value = ''; originGeocodeResults.value = results; originSuggestions.value = []; showOriginSuggestions.value = true
  }
}
async function validateDest() {
  if (!destinationInput.value.trim()) return
  if (store.params.destination?.query === destinationInput.value.trim() && store.params.destination.lat != null) {
    destValid.value = 'valid'; destLevel.value = 'selected'; return
  }
  destValid.value = 'loading'
  const results = await geocodeAddress(destinationInput.value.trim())
  if (!results || results.length === 0) {
    destValid.value = 'invalid'; destLevel.value = ''; destGeocodeResults.value = []; showDestSuggestions.value = true
  } else if (results.length === 1) {
    const r = results[0]
    destValid.value = 'valid'; destLevel.value = r.level || ''; destGeocodeResults.value = []; showDestSuggestions.value = false
    store.setDestination({ query: destinationInput.value.trim(), lat: r.lat, lon: r.lon, shortName: r.district || r.city || destinationInput.value.trim(), fullName: r.formattedAddress || destinationInput.value.trim() })
  } else {
    destValid.value = 'idle'; destLevel.value = ''; destGeocodeResults.value = results; destSuggestions.value = []; showDestSuggestions.value = true
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false; showDestSuggestions.value = false
  originGeocodeResults.value = []; destGeocodeResults.value = []
}

function selectOriginGeocode(r: GeocodeResult) {
  originInput.value = r.formattedAddress || originInput.value.trim()
  originValid.value = 'valid'; originLevel.value = r.level || ''
  originGeocodeResults.value = []; showOriginSuggestions.value = false
  store.setOrigin({ query: originInput.value.trim(), lat: r.lat, lon: r.lon, shortName: r.district || r.city || originInput.value.trim(), fullName: r.formattedAddress || originInput.value.trim() })
}
function selectDestGeocode(r: GeocodeResult) {
  destinationInput.value = r.formattedAddress || destinationInput.value.trim()
  destValid.value = 'valid'; destLevel.value = r.level || ''
  destGeocodeResults.value = []; showDestSuggestions.value = false
  store.setDestination({ query: destinationInput.value.trim(), lat: r.lat, lon: r.lon, shortName: r.district || r.city || destinationInput.value.trim(), fullName: r.formattedAddress || destinationInput.value.trim() })
}

const isLocating = ref(false)
async function useMyLocation() {
  if (isLocating.value) return
  isLocating.value = true
  try {
    const pos = await getGeoPosition()
    const name = pos.district || pos.city || '当前位置'
    originInput.value = name; originValid.value = 'valid'; originLevel.value = 'gps'
    store.setOrigin({ query: name, lat: pos.lat, lon: pos.lon, shortName: pos.city, fullName: pos.address })
  } catch (e: any) {
    alert(`定位失败：${e?.message || '请手动输入起点'}`)
  } finally { isLocating.value = false }
}

function swapOriginDest() {
  const t = originInput.value; originInput.value = destinationInput.value; destinationInput.value = t
  const lt = originLevel.value; originLevel.value = destLevel.value; destLevel.value = lt
  const vt = originValid.value; originValid.value = destValid.value; destValid.value = vt
  const tp = store.params.origin; store.setOrigin(store.params.destination); store.setDestination(tp)
}

function focusOnOrigin() {
  const o = store.params.origin
  if (o && o.lat != null) store.mapControls?.panTo(o.lon!, o.lat!, 12)
}
function focusOnDest() {
  const d = store.params.destination
  if (d && d.lat != null) store.mapControls?.panTo(d.lon!, d.lat!, 12)
}

async function handleEnterPlanning() {
  if (!canEnterPlanning.value) return
  isEnteringPlanning.value = true; enterError.value = null
  try {
    store.params.totalDays = totalDays.value
    store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
    store.setMaxDeviation(deviationDistance.value)
    store.setCurrentStrategy(2)
    const o = store.params.origin!; const d = store.params.destination!
    const routes = await store.computeRoutes(o, d, 2)
    if (routes.length > 0) { store.setRouteAlternatives(routes); store.setRouteInfo(routes[0]) }
    stage.value = 'confirmed'; searchCount.value = 0; showAlternatives.value = false
    await store.searchPoisByRoute()
  } catch (e: any) { enterError.value = e?.message || '进入规划失败' }
  finally { isEnteringPlanning.value = false }
}

function handleBackToForm() {
  stage.value = 'input'; store.setRouteInfo(null); store.setAvailableRoutes([])
  store.setRouteAlternatives([]); store.setCurrentStrategy(2); searchCount.value = 0; showAlternatives.value = false
}

async function handleStrategyClick(s: number) {
  if (s === store.currentStrategy) return
  isSwitchingStrategy.value = true; showAlternatives.value = false
  try { store.setCurrentStrategy(s) }
  finally { setTimeout(() => { isSwitchingStrategy.value = false }, 1500) }
}

function handleSearch() {
  if (searchCount.value >= 3) return
  searchCount.value++; store.searchPoisByRoute()
}

function formatDistance(m: number) { return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m} m` }
function formatDurationShort(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return { h, m }
}

const currentRouteInfo = computed<RouteInfo | null>(() => {
  if (store.routeInfo) return store.routeInfo
  return store.availableRoutes.find(r => r.strategy === store.currentStrategy) || null
})
const highwayRatio = computed(() => {
  const r = currentRouteInfo.value
  if (!r || !r.tollDistance || !r.distance) return 0
  return Math.round((r.tollDistance / r.distance) * 100)
})

const showTollAsLength = ref(false)
const showAllRoads = ref(false)
</script>

<template>
  <div class="flex flex-col h-full bg-[#F5F0E8]" @click="closeSuggestions">
    <!-- 地名数据 banner -->
    <div
      v-if="districtBannerVisible"
      class="flex-shrink-0 px-3 py-1.5 text-[11px] flex items-center gap-1.5"
      :class="districtReady ? 'bg-[#E8DCC7] text-[#606C38]' : 'bg-[#E8DCC7] text-[#8B8578]'"
    >
      <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" :class="districtReady ? 'bg-[#606C38]' : 'bg-[#8B8578] animate-pulse'"></span>
      <span class="truncate">
        <template v-if="districtReady">{{ districtNodeCount }} 个区划就绪</template>
        <template v-else>加载地名数据...</template>
      </span>
    </div>

    <!-- 标题栏 -->
    <div class="flex-shrink-0 px-4 py-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-[#2D2A26] tracking-tight flex items-center gap-1.5">
        <Icon v-if="isConfirmed" icon="ph:bookmark-simple" :width="15" :height="15" class="text-[#7EB8DA]" />
        <Icon v-else icon="ph:squares-four" :width="15" :height="15" class="text-[#E8C547]" />
        {{ isConfirmed ? '路线规划' : '行程规划' }}
      </h2>
      <button
        v-if="isConfirmed"
        class="text-[11px] text-[#8B8578] hover:text-[#C66B3D] transition-colors flex items-center gap-1"
        @click.stop="handleBackToForm"
      >
        <Icon icon="ph:pencil-simple" :width="12" :height="12" />
        修改起点终点
      </button>
    </div>

    <!-- ========== 输入阶段 ========== -->
    <div v-if="stage === 'input'" class="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
      <!-- 起点 -->
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <label class="text-[11px] font-medium text-[#8B8578] mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
          <span class="w-2 h-2 rounded-full bg-[#606C38] inline-block"></span>
          起点
        </label>
        <div class="relative">
          <input
            v-model="originInput"
            placeholder="输入起点城市"
            class="w-full px-3 py-2 text-sm border border-[#E8DCC7] rounded-lg focus:outline-none focus:border-[#C66B3D] transition-colors pr-10 bg-[#FAFAF7]"
            @click.stop
            @focus="onOriginFocus"
            @blur="validateOrigin"
            @keyup.enter="validateOrigin"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span v-if="originValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-[#C66B3D] border-t-transparent rounded-full"></span>
            <span v-else-if="originValid === 'valid'" class="text-[#606C38] text-xs">&#10003;</span>
            <span v-else-if="originValid === 'invalid'" class="text-[#C66B3D] text-xs">!</span>
            <button
              class="text-[#8B8578] hover:text-[#C66B3D] disabled:opacity-50 transition-colors"
              :disabled="isLocating"
              @click.stop="useMyLocation"
              :title="isLocating ? '定位中...' : '使用当前位置'"
            >
              <Icon v-if="!isLocating" icon="ph:crosshair-simple" :width="16" :height="16" />
              <span v-else class="inline-block animate-spin w-4 h-4 border-2 border-[#C66B3D] border-t-transparent rounded-full"></span>
            </button>
          </div>
          <!-- 下拉建议 -->
          <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E8DCC7] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-[#8B8578]">加载中...</div>
            <div v-else-if="originGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-[10px] text-[#8B8578] bg-[#F5F0E8] rounded-t-xl">请选择匹配地点</div>
              <div v-for="(r, idx) in originGeocodeResults" :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-[#F5F0E8] border-b border-[#E8DCC7] last:border-0 transition-colors"
                @mousedown.prevent.stop="selectOriginGeocode(r)"
              >
                <span class="font-medium text-[#2D2A26]">{{ r.formattedAddress }}</span>
                <span class="text-[10px] text-[#8B8578] ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="originSuggestions.length === 0" class="px-3 py-2 text-xs text-[#8B8578]">无匹配地点</div>
            <div v-for="s in originSuggestions" :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-[#F5F0E8] border-b border-[#E8DCC7] last:border-0 transition-colors"
              @mousedown.prevent.stop="selectOrigin(s)"
            >
              <span class="font-medium text-[#2D2A26]">{{ s.path || s.name }}</span>
              <span class="text-[10px] text-[#8B8578] ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="store.params.origin?.lat != null"
          class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[#EFF5ED] text-[#606C38] cursor-pointer hover:bg-[#D9E8D4] transition-colors"
          @click.stop="focusOnOrigin"
        >
          {{ store.params.origin.shortName }}
          <span v-if="originLevel === 'city'" class="text-[#C66B3D] text-[9px] ml-0.5">市级</span>
          <span v-else-if="originLevel === 'gps'" class="text-[#606C38] text-[9px] ml-0.5">GPS</span>
        </div>
      </div>

      <!-- 互换 -->
      <div class="flex justify-center -my-1">
        <button class="w-8 h-8 rounded-full border border-[#E8DCC7] bg-white text-[#8B8578] hover:text-[#C66B3D] hover:border-[#C66B3D] flex items-center justify-center transition-colors shadow-sm" @click.stop="swapOriginDest" title="互换起终点">
          <Icon icon="ph:arrows-left-right" :width="14" :height="14" />
        </button>
      </div>

      <!-- 终点 -->
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <label class="text-[11px] font-medium text-[#8B8578] mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
          <span class="w-2 h-2 rounded-full bg-[#C66B3D] inline-block"></span>
          终点
        </label>
        <div class="relative">
          <input
            v-model="destinationInput"
            placeholder="输入终点城市"
            class="w-full px-3 py-2 text-sm border border-[#E8DCC7] rounded-lg focus:outline-none focus:border-[#C66B3D] transition-colors pr-8 bg-[#FAFAF7]"
            @click.stop
            @focus="onDestFocus"
            @blur="validateDest"
            @keyup.enter="validateDest"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            <span v-if="destValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-[#C66B3D] border-t-transparent rounded-full"></span>
            <span v-else-if="destValid === 'valid'" class="text-[#606C38] text-xs">&#10003;</span>
            <span v-else-if="destValid === 'invalid'" class="text-[#C66B3D] text-xs">!</span>
          </div>
          <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 bg-white border border-[#E8DCC7] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-[#8B8578]">加载中...</div>
            <div v-else-if="destGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-[10px] text-[#8B8578] bg-[#F5F0E8] rounded-t-xl">请选择匹配地点</div>
              <div v-for="(r, idx) in destGeocodeResults" :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-[#F5F0E8] border-b border-[#E8DCC7] last:border-0 transition-colors"
                @mousedown.prevent.stop="selectDestGeocode(r)"
              >
                <span class="font-medium text-[#2D2A26]">{{ r.formattedAddress }}</span>
                <span class="text-[10px] text-[#8B8578] ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="destSuggestions.length === 0" class="px-3 py-2 text-xs text-[#8B8578]">无匹配地点</div>
            <div v-for="s in destSuggestions" :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-[#F5F0E8] border-b border-[#E8DCC7] last:border-0 transition-colors"
              @mousedown.prevent.stop="selectDest(s)"
            >
              <span class="font-medium text-[#2D2A26]">{{ s.path || s.name }}</span>
              <span class="text-[10px] text-[#8B8578] ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="store.params.destination?.lat != null"
          class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[#FDF2EC] text-[#C66B3D] cursor-pointer hover:bg-[#F8DFD3] transition-colors"
          @click.stop="focusOnDest"
        >
          {{ store.params.destination.shortName }}
          <span v-if="destLevel === 'city'" class="text-[#C66B3D] text-[9px] ml-0.5">市级</span>
        </div>
      </div>

      <!-- 旅行参数 -->
      <div class="bg-white rounded-xl p-3 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-[#8B8578] uppercase tracking-wider">旅行天数</label>
          <div class="flex items-center gap-1.5">
            <input v-model.number="totalDays" type="number" min="1" max="30" class="w-14 px-2 py-1 text-sm text-center border border-[#E8DCC7] rounded-lg focus:border-[#C66B3D] focus:outline-none bg-[#FAFAF7]" />
            <span class="text-[11px] text-[#8B8578]">天</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-[#8B8578] uppercase tracking-wider">每日上限</label>
          <div class="flex items-center gap-1.5">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="w-20 h-1 accent-[#C66B3D]" />
            <span class="text-[11px] font-semibold text-[#C66B3D] w-8 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <!-- 进入规划 -->
      <button
        :disabled="!canEnterPlanning || isEnteringPlanning"
        class="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
        :class="canEnterPlanning && !isEnteringPlanning ? 'bg-[#C66B3D] text-white hover:bg-[#B55E32] shadow-md' : 'bg-[#E8DCC7] text-[#8B8578]'"
        @click="handleEnterPlanning"
      >
        <template v-if="isEnteringPlanning">
          <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          计算中...
        </template>
        <template v-else>
          <Icon icon="ph:sign-out" :width="16" :height="16" />
          进入规划
        </template>
      </button>
      <p v-if="enterError" class="text-[11px] text-[#C66B3D] text-center">{{ enterError }}</p>
    </div>

    <!-- ========== 规划阶段 ========== -->
    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
      <!-- 路线概览卡 -->
      <div v-if="currentRouteInfo" class="bg-white rounded-xl p-4 shadow-sm">
        <!-- 策略标签 -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-[11px] font-medium text-[#8B8578] uppercase tracking-wider">
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.label }}
            <span v-if="isSwitchingStrategy" class="ml-1 inline-block animate-spin w-2.5 h-2.5 border-2 border-[#C66B3D] border-t-transparent rounded-full align-middle"></span>
          </span>
        </div>
        <!-- 核心数据：距离 | 时长 -->
        <div class="flex items-center divide-x divide-[#E8DCC7] mb-3">
          <div class="flex-1 text-center px-2">
            <p class="text-2xl font-bold text-[#2D2A26] leading-none tracking-tight">
              {{ (currentRouteInfo.distance / 1000).toFixed(0) }}<span class="text-[11px] font-medium text-[#8B8578] ml-0.5">km</span>
            </p>
            <p class="text-[10px] text-[#8B8578] mt-1">总距离</p>
          </div>
          <div class="flex-1 text-center px-2">
            <p class="text-2xl font-bold text-[#2D2A26] leading-none tracking-tight">
              {{ formatDurationShort(currentRouteInfo.duration).h }}<span class="text-[11px] font-medium text-[#8B8578]">h</span><template v-if="formatDurationShort(currentRouteInfo.duration).m > 0"><span class="text-[11px] text-[#8B8578] mx-px"> </span>{{ formatDurationShort(currentRouteInfo.duration).m }}<span class="text-[11px] font-medium text-[#8B8578]">m</span></template>
            </p>
            <p class="text-[10px] text-[#8B8578] mt-1">预计时长</p>
          </div>
        </div>
        <!-- 次重点：过路费 | 高速/收费(可切换) | 红绿灯 -->
        <div class="flex items-center divide-x divide-[#E8DCC7] mb-2">
          <div class="flex-1 text-center px-2">
            <p v-if="currentRouteInfo.tolls" class="text-base font-bold text-[#C66B3D] leading-none">
              {{ currentRouteInfo.tolls }}<span class="text-[11px] font-medium ml-0.5">元</span>
            </p>
            <p v-else class="text-base font-bold text-[#606C38] leading-none">免费</p>
            <p class="text-[10px] text-[#8B8578] mt-1">过路费</p>
          </div>
          <button
            class="flex-1 text-center px-2 group"
            @click.stop="showTollAsLength = !showTollAsLength"
            title="点击切换显示"
          >
            <p class="text-base font-bold text-[#2D2A26] leading-none group-hover:text-[#C66B3D] transition-colors">
              <template v-if="!showTollAsLength">{{ highwayRatio }}<span class="text-[11px] font-medium ml-0.5">%</span></template>
              <template v-else>{{ currentRouteInfo.tollDistance ? formatDistance(currentRouteInfo.tollDistance) : '—' }}</template>
            </p>
            <p class="text-[10px] text-[#8B8578] mt-1 flex items-center justify-center gap-0.5">
              <span>{{ showTollAsLength ? '收费路段' : '收费占比' }}</span>
              <span class="text-[8px] text-[#C66B3D]">&#9654;</span>
            </p>
          </button>
          <div class="flex-1 text-center px-2">
            <p class="text-base font-bold text-[#2D2A26] leading-none">{{ currentRouteInfo.trafficLights ?? '—' }}</p>
            <p class="text-[10px] text-[#8B8578] mt-1">红绿灯</p>
          </div>
        </div>
        <!-- 主要道路 -->
        <div v-if="currentRouteInfo.mainRoads && currentRouteInfo.mainRoads.length > 0" class="mt-2 pt-2 border-t border-[#E8DCC7]">
          <button
            class="w-full text-left flex items-center gap-1 group"
            @click.stop="showAllRoads = !showAllRoads"
          >
            <p class="text-[11px] text-[#8B8578]">途经路线</p>
            <span class="text-[8px] text-[#C66B3D] transition-transform" :class="showAllRoads ? 'rotate-90' : ''">&#9654;</span>
          </button>
          <div v-if="showAllRoads" class="mt-1.5 space-y-0.5">
            <p v-for="(road, idx) in currentRouteInfo.mainRoads" :key="idx" class="text-[11px] text-[#2D2A26] leading-relaxed">
              {{ road }}
            </p>
          </div>
          <p v-else class="text-[11px] text-[#2D2A26] mt-1 truncate leading-relaxed">
            {{ currentRouteInfo.mainRoads.slice(0, 3).join(' / ') }}<span v-if="currentRouteInfo.mainRoads.length > 3"> ...</span>
          </p>
        </div>
      </div>
      <div v-else class="bg-white rounded-xl p-4 shadow-sm text-center text-sm text-[#8B8578]">
        <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-[#C66B3D] border-t-transparent rounded-full mr-2 align-middle"></span>
        计算路线中...
      </div>

      <!-- 策略选择 -->
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <div class="flex gap-1.5">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :title="s.desc"
            :disabled="isSwitchingStrategy"
            :class="[
              'flex-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-all',
              store.currentStrategy === s.value
                ? 'bg-[#C66B3D] text-white shadow-sm'
                : 'bg-[#F5F0E8] text-[#8B8578] hover:bg-[#E8DCC7]',
              isSwitchingStrategy ? 'opacity-50 cursor-not-allowed' : '',
            ]"
            @click="handleStrategyClick(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- 备选路线 -->
      <div v-if="store.routeAlternatives.length > 1" class="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          class="w-full px-4 py-2.5 flex items-center justify-between text-[11px] font-medium text-[#8B8578] hover:bg-[#F5F0E8] transition-colors"
          @click="showAlternatives = !showAlternatives"
        >
          <span>备选路线 ({{ store.routeAlternatives.length }})</span>
          <span class="text-[10px] transition-transform" :class="showAlternatives ? 'rotate-90' : ''">&#9654;</span>
        </button>
        <div v-if="showAlternatives" class="border-t border-[#E8DCC7]">
          <div
            v-for="(alt, idx) in store.routeAlternatives"
            :key="idx"
            class="px-4 py-2.5 cursor-pointer transition-colors border-b border-[#E8DCC7] last:border-0"
            :class="store.routeInfo?.distance === alt.distance && store.routeInfo?.duration === alt.duration
              ? 'bg-[#FDF2EC]'
              : 'hover:bg-[#F5F0E8]'"
            @click="store.selectAlternative(idx)"
          >
            <div class="flex justify-between items-center">
              <span class="text-[11px] font-medium text-[#2D2A26]">路线 {{ idx + 1 }}</span>
              <span class="text-[11px] font-semibold text-[#C66B3D]">{{ formatDistance(alt.distance) }}</span>
            </div>
            <div class="flex justify-between text-[10px] text-[#8B8578] mt-0.5">
              <span>{{ Math.floor(alt.duration / 3600) }}h{{ Math.floor((alt.duration % 3600) / 60) }}m</span>
              <span>{{ alt.tolls ? `¥${alt.tolls}` : '免费' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索 + 抽屉 -->
      <div class="bg-white rounded-xl p-3 shadow-sm space-y-2">
        <div class="flex gap-1.5">
          <button
            :disabled="store.isSearchingPois || searchCount >= 3"
            class="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center gap-1"
            :class="searchCount >= 3 ? 'bg-[#E8DCC7] text-[#8B8578]' : 'bg-[#606C38] text-white hover:bg-[#4E582D]'"
            @click.stop="handleSearch"
          >
            <Icon icon="ph:magnifying-glass" :width="12" :height="12" />
            {{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '次数用完' : '搜索景点' }}
          </button>
          <button
            class="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-[#C66B3D] text-white hover:bg-[#B55E32] transition-colors flex items-center justify-center gap-1"
            @click.stop="store.setPoiDrawerOpen(true)"
          >
            <Icon icon="ph:map-pin" :width="12" :height="12" />
            景点管理
          </button>
        </div>
        <p v-if="searchCount >= 3" class="text-[10px] text-[#C66B3D] text-center">搜索次数用完</p>
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-[#8B8578]">搜索范围</span>
          <input v-model.number="deviationDistance" type="range" min="5" max="100" step="5" class="flex-1 h-1 accent-[#C66B3D]" />
          <span class="text-[10px] font-medium text-[#C66B3D] w-12 text-right">&plusmn;{{ deviationDistance }}km</span>
        </div>
      </div>

      <!-- POI 状态 -->
      <div class="text-[10px] text-[#8B8578] px-1 space-y-0.5">
        <p v-if="store.candidatePois.length > 0">候选 <span class="font-semibold text-[#606C38]">{{ store.candidatePois.length }}</span> 个景点</p>
        <p v-if="store.selectedPois.length > 0">已选 <span class="font-semibold text-[#C66B3D]">{{ store.selectedPois.length }}</span> 个</p>
        <p v-if="store.candidatePois.length === 0 && !store.isSearchingPois" class="text-[#B0A99F] italic">点击搜索景点查找沿途推荐</p>
        <p v-if="store.isSearchingPois" class="flex items-center gap-1">
          <span class="inline-block animate-spin w-2 h-2 border-2 border-[#C66B3D] border-t-transparent rounded-full"></span>
          搜索中...
        </p>
      </div>
    </div>
  </div>
</template>
