<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useTripStore, type RouteInfo } from '@/store/tripStore'

// ================= 手术位置 1：注入新状态库 =================
import { useRouteStore } from '@/stores/routeStore'
import { usePoiStore } from '@/stores/poiStore'
import { VueDraggable } from 'vue-draggable-plus'

const routeStore = useRouteStore()
const poiStore = usePoiStore()
// =========================================================

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

// 按天规划 tab
const activeDay = ref(0) // 0 = 总览, 1-N = Day1-DayN
const dayTabs = computed(() => {
  const tabs = [{ key: 0, label: '总览' }]
  for (let i = 1; i <= totalDays.value; i++) {
    tabs.push({ key: i, label: `Day${i}` })
  }
  return tabs
})

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
  } catch (e: any) { enterError.value = e?.message || '进入规划失败' }
  finally { isEnteringPlanning.value = false }
}

function handleBackToForm() {
  stage.value = 'input'; store.setRouteInfo(null); store.setAvailableRoutes([])
  store.setRouteAlternatives([]); store.setCurrentStrategy(2); searchCount.value = 0; showAlternatives.value = false
}

async function handleStrategyClick(s: number) {
  if (s === store.currentStrategy) return
  isSwitchingStrategy.value = true
  try {
    store.setCurrentStrategy(s)
    // 切换后如果有多条备选路线，自动展开
    await nextTick()
    if (store.routeAlternatives.length > 1) {
      showAlternatives.value = true
    }
  } finally {
    setTimeout(() => { isSwitchingStrategy.value = false }, 1500)
  }
}

function handleSearch() {
  if (searchCount.value >= 3) return
  searchCount.value++; store.searchPoisByRoute()
}

async function handleConfirmPois() {
  if (store.selectedPois.length === 0) return
  // 将选中的 POI 转为途径点
  store.confirmPoisAsWaypoints()
  // 等待响应式更新
  await nextTick()
  // 重算路线（带途径点）
  const o = store.params.origin
  const d = store.params.destination
  if (!o || !d || o.lat == null || d.lat == null) return
  isSwitchingStrategy.value = true
  try {
    const routes = await store.computeRoutes(o, d, store.currentStrategy)
    if (routes.length > 0) {
      store.setRouteAlternatives(routes)
      store.setRouteInfo(routes[0])
    }
  } finally {
    isSwitchingStrategy.value = false
  }
}

function handleEnterDayPlan() {
  activeDay.value = 1
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
  <div class="flex flex-col h-full bg-[var(--color-surface-alt)]" @click="closeSuggestions">
    <!-- 地名数据 banner -->
    <div
      v-if="districtBannerVisible"
      class="flex-shrink-0 px-3 py-1.5 text-[11px] flex items-center gap-1.5"
      :class="districtReady ? 'bg-[var(--color-border)] text-[var(--color-secondary)]' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'"
    >
      <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" :class="districtReady ? 'bg-[var(--color-secondary)]' : 'bg-[#8B8578] animate-pulse'"></span>
      <span class="truncate">
        <template v-if="districtReady">{{ districtNodeCount }} 个区划就绪</template>
        <template v-else>加载地名数据...</template>
      </span>
    </div>

    <!-- 标题栏 -->
    <div class="flex-shrink-0 px-4 py-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-[var(--color-text)] tracking-tight flex items-center gap-1.5">
        <Icon v-if="isConfirmed" icon="ph:bookmark-simple" :width="15" :height="15" class="text-[var(--color-accent)]" />
        <Icon v-else icon="ph:squares-four" :width="15" :height="15" class="text-[var(--color-amber)]" />
        {{ isConfirmed ? '路线规划' : '行程规划' }}
      </h2>
      <button
        v-if="isConfirmed"
        class="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-1"
        @click.stop="handleBackToForm"
      >
        <Icon icon="ph:pencil-simple" :width="12" :height="12" />
        修改起点终点
      </button>
    </div>

    <!-- ========== 输入阶段 ========== -->
    <div v-if="stage === 'input'" class="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
      <!-- 起点 -->
      <div class="rounded-2xl p-4 shadow-sm" style="background: var(--color-surface)">
        <label class="text-xs font-medium text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5 uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--color-secondary)] inline-block"></span>
          起点
        </label>
        <div class="relative">
          <input
            v-model="originInput"
            placeholder="输入起点城市"
            class="w-full px-4 py-3 text-base border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[var(--color-primary)] transition-colors pr-12 bg-[var(--color-surface-alt)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            @click.stop
            @focus="onOriginFocus"
            @blur="validateOrigin"
            @keyup.enter="validateOrigin"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span v-if="originValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-full"></span>
            <span v-else-if="originValid === 'valid'" class="text-[var(--color-secondary)] text-xs">&#10003;</span>
            <span v-else-if="originValid === 'invalid'" class="text-[var(--color-primary)] text-xs">!</span>
            <button
              class="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50 transition-colors"
              :disabled="isLocating"
              @click.stop="useMyLocation"
              :title="isLocating ? '定位中...' : '使用当前位置'"
            >
              <Icon v-if="!isLocating" icon="ph:crosshair-simple" :width="16" :height="16" />
              <span v-else class="inline-block animate-spin w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full"></span>
            </button>
          </div>
          <!-- 下拉建议 -->
          <div v-if="showOriginSuggestions" class="absolute left-0 right-0 top-full mt-1 border border-[var(--color-border)] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto" style="background: var(--color-surface)">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-[var(--color-text-secondary)]">加载中...</div>
            <div v-else-if="originGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface-alt)] rounded-t-xl">请选择匹配地点</div>
              <div v-for="(r, idx) in originGeocodeResults" :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] last:border-0 transition-colors"
                @mousedown.prevent.stop="selectOriginGeocode(r)"
              >
                <span class="font-medium text-[var(--color-text)]">{{ r.formattedAddress }}</span>
                <span class="text-[10px] text-[var(--color-text-secondary)] ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="originSuggestions.length === 0" class="px-3 py-2 text-xs text-[var(--color-text-secondary)]">无匹配地点</div>
            <div v-for="s in originSuggestions" :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] last:border-0 transition-colors"
              @mousedown.prevent.stop="selectOrigin(s)"
            >
              <span class="font-medium text-[var(--color-text)]">{{ s.path || s.name }}</span>
              <span class="text-[10px] text-[var(--color-text-secondary)] ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="store.params.origin?.lat != null"
          class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--color-secondary)] text-[var(--color-secondary)] cursor-pointer hover:bg-[var(--color-secondary)] transition-colors"
          @click.stop="focusOnOrigin"
        >
          {{ store.params.origin.shortName }}
          <span v-if="originLevel === 'city'" class="text-[var(--color-primary)] text-[9px] ml-0.5">市级</span>
          <span v-else-if="originLevel === 'gps'" class="text-[var(--color-secondary)] text-[9px] ml-0.5">GPS</span>
        </div>
      </div>

      <!-- 互换 -->
      <div class="flex justify-center" style="margin: -6px 0; z-index: 10; position: relative">
        <button class="w-10 h-10 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] flex items-center justify-center transition-colors shadow-sm" style="background: var(--color-surface)" @click.stop="swapOriginDest" title="互换起终点">
          <Icon icon="ph:arrows-down-up" :width="16" :height="16" />
        </button>
      </div>

      <!-- 终点 -->
      <div class="rounded-2xl p-4 shadow-sm" style="background: var(--color-surface)">
        <label class="text-xs font-medium text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5 uppercase tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] inline-block"></span>
          终点
        </label>
        <div class="relative">
          <input
            v-model="destinationInput"
            placeholder="输入终点城市"
            class="w-full px-4 py-3 text-base border border-[var(--color-border)] rounded-xl focus:outline-none focus:border-[var(--color-primary)] transition-colors pr-8 bg-[var(--color-surface-alt)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
            @click.stop
            @focus="onDestFocus"
            @blur="validateDest"
            @keyup.enter="validateDest"
          />
          <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            <span v-if="destValid === 'loading'" class="inline-block animate-spin w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-full"></span>
            <span v-else-if="destValid === 'valid'" class="text-[var(--color-secondary)] text-xs">&#10003;</span>
            <span v-else-if="destValid === 'invalid'" class="text-[var(--color-primary)] text-xs">!</span>
          </div>
          <div v-if="showDestSuggestions" class="absolute left-0 right-0 top-full mt-1 border border-[var(--color-border)] rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto" style="background: var(--color-surface)">
            <div v-if="!districtReady" class="px-3 py-2 text-xs text-[var(--color-text-secondary)]">加载中...</div>
            <div v-else-if="destGeocodeResults.length > 0">
              <div class="px-3 py-1.5 text-[10px] text-[var(--color-text-secondary)] bg-[var(--color-surface-alt)] rounded-t-xl">请选择匹配地点</div>
              <div v-for="(r, idx) in destGeocodeResults" :key="idx"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] last:border-0 transition-colors"
                @mousedown.prevent.stop="selectDestGeocode(r)"
              >
                <span class="font-medium text-[var(--color-text)]">{{ r.formattedAddress }}</span>
                <span class="text-[10px] text-[var(--color-text-secondary)] ml-1.5">{{ r.level }}</span>
              </div>
            </div>
            <div v-else-if="destSuggestions.length === 0" class="px-3 py-2 text-xs text-[var(--color-text-secondary)]">无匹配地点</div>
            <div v-for="s in destSuggestions" :key="s.adcode"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-alt)] border-b border-[var(--color-border)] last:border-0 transition-colors"
              @mousedown.prevent.stop="selectDest(s)"
            >
              <span class="font-medium text-[var(--color-text)]">{{ s.path || s.name }}</span>
              <span class="text-[10px] text-[var(--color-text-secondary)] ml-1.5">
                {{ s.level === 'city' ? '市' : s.level === 'district' ? '区' : s.level === 'province' ? '省' : '' }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="store.params.destination?.lat != null"
          class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--color-primary-light)] text-[var(--color-primary)] cursor-pointer hover:bg-[var(--color-primary-light)] transition-colors"
          @click.stop="focusOnDest"
        >
          {{ store.params.destination.shortName }}
          <span v-if="destLevel === 'city'" class="text-[var(--color-primary)] text-[9px] ml-0.5">市级</span>
        </div>
      </div>

      <!-- 旅行参数 -->
      <div class="rounded-xl p-3 shadow-sm space-y-3" style="background: var(--color-surface)">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">旅行天数</label>
          <div class="flex items-center gap-1.5">
            <input v-model.number="totalDays" type="number" min="1" max="30" class="w-14 px-2 py-1 text-sm text-center border border-[var(--color-border)] rounded-lg focus:border-[var(--color-primary)] focus:outline-none bg-[var(--color-surface-alt)]" />
            <span class="text-[11px] text-[var(--color-text-secondary)]">天</span>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">每日上限</label>
          <div class="flex items-center gap-1.5">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="w-20 h-1 accent-[#C66B3D]" />
            <span class="text-[11px] font-semibold text-[var(--color-primary)] w-8 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <!-- 进入规划 -->
      <button
        :disabled="!canEnterPlanning || isEnteringPlanning"
        class="w-full py-4 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 transition-all shadow-lg"
        :class="canEnterPlanning && !isEnteringPlanning ? 'bg-[var(--color-primary)] text-[var(--color-surface)]' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'"
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
      <p v-if="enterError" class="text-[11px] text-[var(--color-primary)] text-center">{{ enterError }}</p>
    </div>

    <!-- ========== 规划阶段 ========== -->
    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
      <!-- 路线概览卡 -->
      <div v-if="currentRouteInfo" class="rounded-xl p-3 shadow-sm" style="background: var(--color-surface)">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-medium" style="color: var(--color-text-secondary)">
            {{ ROUTE_STRATEGIES.find(s => s.value === currentRouteInfo!.strategy)?.label }}
            <span v-if="isSwitchingStrategy" class="ml-1 inline-block animate-spin w-2.5 h-2.5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full align-middle"></span>
          </span>
          <button
            class="text-[10px] flex items-center gap-1"
            style="color: var(--color-primary)"
            @click.stop="showAllRoads = !showAllRoads"
          >
            详细信息
            <span class="transition-transform duration-200" :class="showAllRoads ? 'rotate-90' : ''">&#9654;</span>
          </button>
        </div>
        <!-- 核心数据：紧凑一行 -->
        <div class="flex items-baseline justify-center gap-4">
          <span class="text-xl font-bold" style="color: var(--color-text)">{{ (currentRouteInfo.distance / 1000).toFixed(0) }}<span class="text-[10px] font-medium ml-0.5" style="color: var(--color-text-secondary)">km</span></span>
          <span class="text-xl font-bold" style="color: var(--color-text)">{{ formatDurationShort(currentRouteInfo.duration).h }}<span class="text-[10px] font-medium" style="color: var(--color-text-secondary)">h</span><template v-if="formatDurationShort(currentRouteInfo.duration).m > 0">{{ formatDurationShort(currentRouteInfo.duration).m }}<span class="text-[10px] font-medium" style="color: var(--color-text-secondary)">m</span></template></span>
          <span class="text-sm font-bold" style="color: var(--color-primary)">{{ currentRouteInfo.tolls ? `¥${currentRouteInfo.tolls}` : '免费' }}</span>
        </div>
        <!-- 详细信息展开 -->
        <div v-if="showAllRoads" class="mt-2 pt-2 border-t border-[var(--color-border)] space-y-1.5">
          <div class="flex items-center justify-between text-[10px]" style="color: var(--color-text-secondary)">
            <span>红绿灯</span><span style="color: var(--color-text)">{{ currentRouteInfo.trafficLights ?? '—' }} 个</span>
          </div>
          <div class="flex items-center justify-between text-[10px]" style="color: var(--color-text-secondary)">
            <span>收费占比</span><span style="color: var(--color-text)">{{ highwayRatio }}%</span>
          </div>
          <div v-if="currentRouteInfo.tollDistance" class="flex items-center justify-between text-[10px]" style="color: var(--color-text-secondary)">
            <span>收费路段</span><span style="color: var(--color-text)">{{ formatDistance(currentRouteInfo.tollDistance) }}</span>
          </div>
          <div v-if="currentRouteInfo.mainRoads && currentRouteInfo.mainRoads.length > 0" class="pt-1.5 border-t border-[var(--color-border)]">
            <p class="text-[10px] mb-1" style="color: var(--color-text-secondary)">途经路线</p>
            <div class="max-h-16 overflow-y-auto space-y-0.5">
              <p v-for="(road, idx) in currentRouteInfo.mainRoads" :key="idx" class="text-[10px] leading-relaxed" style="color: var(--color-text)">{{ road }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 策略选择 + 备选路线 -->
      <div class="rounded-xl shadow-sm overflow-hidden" style="background: var(--color-surface)">
        <div class="flex gap-1.5 p-2 pb-1.5">
          <button
            v-for="s in ROUTE_STRATEGIES"
            :key="s.value"
            :disabled="isSwitchingStrategy"
            :class="[
              'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all relative',
              store.currentStrategy === s.value
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]',
              isSwitchingStrategy ? 'opacity-50' : '',
            ]"
            @click="handleStrategyClick(s.value)"
          >
            {{ s.label }}
            <!-- 备选路线提示红点 -->
            <span
              v-if="s.value !== 2 && store.routeAlternatives.length > 1 && store.currentStrategy === s.value"
              class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
              style="background: var(--color-amber)"
            ></span>
          </button>
        </div>
        <!-- 备选路线折叠 -->
        <div v-if="store.routeAlternatives.length > 1" class="border-t border-[var(--color-border)]">
          <button
            class="w-full px-3 py-2 flex items-center justify-between text-[11px] font-medium transition-colors"
            :style="showAlternatives ? { background: 'var(--color-primary-light)', color: 'var(--color-primary)' } : { color: 'var(--color-text-secondary)' }"
            @click="showAlternatives = !showAlternatives"
          >
            <span class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-amber)"></span>
              备选路线 ({{ store.routeAlternatives.length }})
            </span>
            <span class="transition-transform duration-200" :class="showAlternatives ? 'rotate-90' : ''">&#9654;</span>
          </button>
          <div v-if="showAlternatives" class="border-t border-[var(--color-border)]">
            <div
              v-for="(alt, idx) in store.routeAlternatives"
              :key="idx"
              class="px-3 py-2 cursor-pointer transition-all duration-200 border-b border-[var(--color-border)] last:border-0"
              :class="store.routeInfo?.distance === alt.distance && store.routeInfo?.duration === alt.duration
                ? 'bg-[var(--color-primary-light)]'
                : 'hover:bg-[var(--color-surface-alt)]'"
              @click="store.selectAlternative(idx)"
            >
              <div class="flex justify-between items-center">
                <span class="text-[11px] font-medium" style="color: var(--color-text)">路线 {{ idx + 1 }}</span>
                <span class="text-[11px] font-semibold" style="color: var(--color-primary)">{{ formatDistance(alt.distance) }}</span>
              </div>
              <div class="flex justify-between text-[10px] mt-0.5" style="color: var(--color-text-secondary)">
                <span>{{ Math.floor(alt.duration / 3600) }}h{{ Math.floor((alt.duration % 3600) / 60) }}m</span>
                <span>{{ alt.tolls ? `¥${alt.tolls}` : '免费' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索沿途景点 + 搜索范围 -->
      <div class="rounded-xl p-3 shadow-sm" style="background: var(--color-surface)">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-medium" style="color: var(--color-text)">搜索范围</span>
          <button
            :disabled="store.isSearchingPois || searchCount >= 3"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
            :class="searchCount >= 3 ? 'bg-[var(--color-border)] text-[var(--color-text-secondary)]' : 'bg-[var(--color-secondary)] text-white'"
            @click.stop="handleSearch"
          >
            <Icon icon="ph:magnifying-glass" :width="12" :height="12" />
            {{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '次数用完' : '搜索沿途景点' }}
          </button>
        </div>
        <div class="flex items-center gap-3">
          <input v-model.number="deviationDistance" type="range" min="5" max="100" step="5" class="flex-1 h-2 accent-[#C66B3D]" />
          <span class="text-[11px] font-semibold flex-shrink-0" style="color: var(--color-primary)">&plusmn;{{ deviationDistance }}km</span>
        </div>
      </div>

      <!-- 景点模块 -->
      <div class="rounded-xl shadow-sm overflow-hidden" style="background: var(--color-surface)">
        <div class="px-3 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-medium" style="color: var(--color-text)">景点</span>
            <span class="text-[10px]" style="color: var(--color-text-secondary)">
              总共 {{ store.candidatePois.length }} 个，已选 {{ store.selectedPois.length }} 个
            </span>
          </div>
          <button
            class="text-[10px] flex items-center gap-1"
            style="color: var(--color-primary)"
            @click.stop="store.setPoiDrawerOpen(true)"
          >
            详情
            <Icon icon="ph:arrow-right" :width="10" :height="10" />
          </button>
        </div>
      </div>

      <!-- 按钮区 -->
      <div class="space-y-2">
        <!-- 重新生成导航预览 -->
        <button
          v-if="store.selectedPois.length > 0"
          class="w-full py-2.5 rounded-xl text-[11px] font-medium transition-all border"
          style="border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light)"
          @click="handleConfirmPois"
        >
          根据已选景点重新生成导航预览
        </button>
        <!-- 进入按天规划 -->
        <button
          class="w-full py-3 rounded-xl text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2"
          style="background: var(--color-primary); color: white"
          @click="handleEnterDayPlan"
        >
          <Icon icon="ph:calendar-blank" :width="16" :height="16" />
          进入按天规划
        </button>
      </div>

      <div v-if="routeStore.routeByDays && routeStore.routeByDays.length > 0" class="mt-4 space-y-4">
        <div class="border-t border-dashed my-3 opacity-60" />
        <h3 class="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center gap-1.5 px-1">
          <Icon icon="ph:road-horizon-duotone" class="w-4 h-4" style="color: var(--color-primary)" />
          <span>时空切片 · 珍珠项链决策单</span>
        </h3>

        <div 
          v-for="(dayPois, dayIdx) in routeStore.routeByDays" 
          :key="dayIdx" 
          class="rounded-xl border p-3.5 space-y-3 shadow-sm transition-all"
          style="border-color: var(--color-border); background: rgba(255, 255, 255, 0.4)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold text-white tracking-wide" style="background: var(--color-primary)">
                DAY {{ dayIdx + 1 }}
              </span>
              <span class="text-xs font-semibold">当日节点精修</span>
            </div>
            <span class="text-[10px] opacity-60 font-medium">
              共 {{ dayPois.length }} 个节点
            </span>
          </div>

          <VueDraggable
            v-model="routeStore.routeByDays[dayIdx]"
            :animation="150"
            handle=".drag-handle"
            item-key="id"
            class="space-y-1.5"
          >
            <div 
              v-for="(wp, wpIdx) in dayPois" 
              :key="wp.id" 
              class="group flex items-center justify-between p-2 rounded-lg border text-xs shadow-sm transition-all"
              style="border-color: var(--color-border); background: rgba(255, 255, 255, 0.8)"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <Icon icon="ph:dots-six-vertical" class="drag-handle w-4 h-4 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" style="color: var(--color-text-secondary)" />
                <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style="color: var(--color-primary); background: var(--color-primary-light)">
                  {{ wpIdx + 1 }}
                </span>
                <span class="font-medium truncate pr-2" style="color: var(--color-text)">{{ wp.poi_details?.name || '未知途经点' }}</span>
              </div>

              <div class="flex items-center gap-3.5 flex-shrink-0">
                <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    :checked="wp.isOvernight" 
                    @change="routeStore.toggleOvernight(wp.id)"
                    class="rounded h-3 w-3 cursor-pointer transition-colors"
                  />
                  <span class="text-[11px] opacity-70 group-hover:opacity-100 transition-opacity">在此过夜</span>
                </label>
                
                <button 
                  @click="routeStore.removeWaypoint(wp.id)"
                  class="p-0.5 rounded transition-colors"
                  style="color: var(--color-text-secondary)"
                  title="移出行程"
                >
                  <Icon icon="ph:trash" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </VueDraggable>

          <div v-if="dayPois.length === 0" class="text-center py-4 border border-dashed rounded-lg opacity-40 text-[11px]">
            暂无当天节点，请在地图罗盘点亮景点加入
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
