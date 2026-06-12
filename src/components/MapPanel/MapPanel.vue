<script setup lang="ts">
import { watch, ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'
import MapClickPopup from './MapClickPopup.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const {
  renderPoiMarkers, renderRouteByREST,
  fitView, toggleSatellite, zoomIn, zoomOut,
  onMapClick, getMap, addTempMarker,
  setEndpointMarker,
} = useMap(mapContainer)

const isSatellite = ref(false)
const clickPos = ref<{ lng: number; lat: number } | null>(null)
const tempMarker = ref<any>(null)

// 地图点击 -> 弹浮层 + 画临时 marker
onMapClick((lng, lat) => {
  const m = getMap()
  if (tempMarker.value && m) m.remove(tempMarker.value)
  clickPos.value = { lng, lat }
  tempMarker.value = addTempMarker(lng, lat, '#F59E0B')
})

function closePopup() {
  const m = getMap()
  if (tempMarker.value && m) m.remove(tempMarker.value)
  tempMarker.value = null
  clickPos.value = null
}

// ============ 起点 / 终点 / 路线 联动 ============

// 起点变化：放 marker + 地图跟随
watch(
  () => store.params.origin,
  (origin) => {
    if (!origin || origin.lat == null || origin.lon == null) return
    setEndpointMarker('origin', origin.lon, origin.lat, origin.shortName || '起点')
    // 不立刻 fitView，留给终点/路线
  },
  { immediate: true, deep: true }
)

// 终点变化：放 marker + 地图跟随
watch(
  () => store.params.destination,
  (dest) => {
    if (!dest || dest.lat == null || dest.lon == null) return
    setEndpointMarker('dest', dest.lon, dest.lat, dest.shortName || '终点')
  },
  { immediate: true, deep: true }
)

// 策略变化：重算当前路线
watch(
  () => store.currentStrategy,
  async (strategy) => {
    const o = store.params.origin
    const d = store.params.destination
    if (!o || !d || o.lat == null || d.lat == null) return
    store.isComputingRoute = true
    try {
      const info = await renderRouteByREST(o, d, strategy)
      if (info) {
        store.setRouteInfo(info)
        // fitView 让整条路线可见
        setTimeout(() => fitView(), 100)
      }
    } finally {
      store.isComputingRoute = false
    }
  }
)

// 监听路线信息变化，画 polyline
watch(
  () => store.routeInfo,
  (info) => {
    if (info && info.polyline && info.polyline.length > 0) {
      // renderRouteByREST 已经画了，这里 fitView
      setTimeout(() => fitView(), 100)
    }
  },
  { deep: true, immediate: false }
)

// 监听候选 POI / 选中 POI 变化，在地图上显示
watch(
  () => store.candidatePois,
  () => {
    if (store.candidatePois.length > 0) {
      renderPoiMarkers(store.candidatePois)
    }
  },
  { deep: true }
)
watch(
  () => store.selectedPois,
  () => {
    renderPoiMarkers(store.candidatePois)
  },
  { deep: true }
)

// 地图左上角策略按钮：预览但不切换（不修改 currentStrategy，除非点了"应用"）
const previewingStrategy = ref<number | null>(null)
async function handleStrategyPreview(strategy: number) {
  const o = store.params.origin
  const d = store.params.destination
  if (!o || !d || o.lat == null || d.lat == null) return
  previewingStrategy.value = strategy
  try {
    const info = await renderRouteByREST(o, d, strategy)
    if (info) {
      store.setRouteInfo(info)
    }
  } finally {
    previewingStrategy.value = null
  }
}

function handleFitView() {
  fitView()
}

function handleToggleSatellite() {
  toggleSatellite()
  isSatellite.value = !isSatellite.value
}

function handleZoomIn() { zoomIn() }
function handleZoomOut() { zoomOut() }
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="mapContainer" class="h-full w-full" />

    <!-- 地图点击浮层 -->
    <MapClickPopup
      v-if="clickPos"
      :lng="clickPos.lng"
      :lat="clickPos.lat"
      @close="closePopup"
    />

    <!-- 路线计算中 -->
    <div v-if="store.isComputingRoute || store.isComputingStrategies" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-4 py-3 rounded-lg shadow-lg z-20 flex items-center gap-2">
      <div class="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      <span class="text-sm text-gray-600">
        {{ store.isComputingStrategies ? '计算 4 种策略路线中...' : '计算路线中...' }}
      </span>
    </div>

    <!-- 左侧控制按钮 -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
      <button
        @click="handleFitView"
        class="bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        📍 归位
      </button>

      <!-- 线路策略预览按钮（仅在两端都设了位置时显示） -->
      <div v-if="store.params.origin && store.params.destination" class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
          🛣️ 线路策略预览
        </div>
        <button
          v-for="strategy in ROUTE_STRATEGIES"
          :key="strategy.value"
          :class="[
            'w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2',
            store.currentStrategy === strategy.value
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50',
          ]"
          :disabled="previewingStrategy !== null"
          @click="handleStrategyPreview(strategy.value)"
          :title="strategy.desc"
        >
          <span>{{ strategy.icon }}</span>
          <div class="flex-1">
            <div>{{ strategy.label }}</div>
            <div class="text-xs text-gray-400 font-normal">{{ strategy.desc }}</div>
          </div>
          <span v-if="store.currentStrategy === strategy.value" class="text-blue-500 text-xs">✓</span>
        </button>
      </div>

      <div class="bg-white rounded-lg shadow-md p-2 text-xs text-gray-500 max-w-[220px]">
        💡 点击地图任意位置可添加该地点或查找附近景点/酒店/美食
      </div>
    </div>

    <!-- 右侧控件 -->
    <div class="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          class="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
          @click="handleZoomIn"
        >+</button>
        <button
          class="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          @click="handleZoomOut"
        >−</button>
      </div>

      <button
        :class="[
          'bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium transition-colors',
          isSatellite ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50',
        ]"
        @click="handleToggleSatellite"
      >
        {{ isSatellite ? '🗺️ 普通' : '🛰️ 卫星' }}
      </button>
    </div>

    <!-- 搜索中提示 -->
    <div v-if="store.isSearchingPois" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-4 py-3 rounded-lg shadow-lg z-20">
      <div class="flex items-center gap-2">
        <div class="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        <span class="text-sm text-gray-600">搜索沿途景点...</span>
      </div>
    </div>

    <PinInfoCard
      v-if="store.selectedLocationId"
      :location="store.locations.find((l) => l.id === store.selectedLocationId)!"
      @close="store.setSelectedLocation(null)"
      @toggle="store.toggleLocation(store.selectedLocationId!)"
    />
  </div>
</template>
