<script setup lang="ts">
import { watch, ref, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'
import MapClickPopup from './MapClickPopup.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const {
  renderPoiMarkers, renderRoutePolyline,
  fitView, toggleSatellite, zoomIn, zoomOut,
  onMapClick, getMap, addTempMarker, panTo,
  setEndpointMarker,
} = useMap(mapContainer)

const isSatellite = ref(false)
const clickPos = ref<{ lng: number; lat: number } | null>(null)
const tempMarker = ref<any>(null)
const strategyPanelOpen = ref(false)  // 默认折叠

let resizeObserver: ResizeObserver | null = null

// 注入 panTo 到 store + 监听容器 resize
onMounted(() => {
  store.setMapControls({ panTo })
  if (mapContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      const m = getMap()
      if (m) m.resize()
    })
    resizeObserver.observe(mapContainer.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

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

// ============ 起点 / 终点变化 -> 自动地图跟随 ============

// 起点：放 marker + panTo zoom 10
watch(
  () => store.params.origin,
  (origin) => {
    if (!origin || origin.lat == null || origin.lon == null) return
    setEndpointMarker('origin', origin.lon, origin.lat, origin.shortName || '起点')
    panTo(origin.lon, origin.lat, 10)
  },
  { immediate: true, deep: true }
)

// 终点：放 marker + panTo zoom 10
watch(
  () => store.params.destination,
  (dest) => {
    if (!dest || dest.lat == null || dest.lon == null) return
    setEndpointMarker('dest', dest.lon, dest.lat, dest.shortName || '终点')
    panTo(dest.lon, dest.lat, 10)
  },
  { immediate: true, deep: true }
)

// 策略变化：重算路线（不自动搜 POI，用户手动点按钮搜）
watch(
  () => store.currentStrategy,
  async (strategy) => {
    const o = store.params.origin
    const d = store.params.destination
    if (!o || !d || o.lat == null || d.lat == null) return
    store.isComputingRoute = true
    try {
      const routes = await store.computeRoutes(o, d, strategy)
      if (routes.length > 0) {
        store.setRouteAlternatives(routes)
        store.setRouteInfo(routes[0])
      } else {
        store.setRouteAlternatives([])
      }
    } finally {
      store.isComputingRoute = false
    }
  }
)

// 监听 routeInfo -> 画线 + fitView
watch(
  () => store.routeInfo,
  (info) => {
    if (info && info.polyline && info.polyline.length > 0) {
      // 直接用已有 polyline 画线，不重新调 API
      renderRoutePolyline(info)
      setTimeout(() => fitView(), 200)
    }
  },
  { deep: true, immediate: false }
)

// 候选 / 选中 POI 变化 -> 渲染 marker
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

// ============ 控件事件 ============
function handleFitView() { fitView() }
function handleToggleSatellite() {
  toggleSatellite()
  isSatellite.value = !isSatellite.value
}
function handleZoomIn() { zoomIn() }
function handleZoomOut() { zoomOut() }

// 地图左上策略按钮：仅切换策略（不弹阶段）
async function handleMapStrategyClick(s: number) {
  store.setCurrentStrategy(s)
}
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
    <div v-if="store.isComputingRoute || store.isComputingStrategies" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-4 py-3 rounded-xl shadow-lg z-20 flex items-center gap-2">
      <div class="animate-spin w-4 h-4 border-2 border-[#C66B3D] border-t-transparent rounded-full"></div>
      <span class="text-sm text-[#2D2A26]">
        {{ store.isComputingStrategies ? '计算策略路线中...' : '计算路线中...' }}
      </span>
    </div>

    <!-- 左侧控制按钮 -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
      <div class="flex gap-2">
        <button
          @click="handleFitView"
          class="bg-white w-9 h-9 rounded-xl shadow-md flex items-center justify-center text-[#2D2A26] hover:bg-[#F5F0E8] transition-colors"
          title="归位"
        >
          <Icon icon="ph:crosshair" :width="18" :height="18" />
        </button>
        <button
          v-if="store.params.origin && store.params.destination && !strategyPanelOpen"
          @click="strategyPanelOpen = true"
          class="bg-white w-9 h-9 rounded-xl shadow-md flex items-center justify-center text-[#2D2A26] hover:bg-[#F5F0E8] transition-colors"
          title="线路策略"
        >
          <Icon icon="ph:git-branch" :width="18" :height="18" />
        </button>
      </div>

      <!-- 展开后的策略面板 -->
      <div v-if="strategyPanelOpen && store.params.origin && store.params.destination" class="bg-white rounded-xl shadow-md overflow-hidden w-[220px]">
        <div class="px-3 py-1.5 text-[11px] text-[#8B8578] bg-[#F5F0E8] border-b border-[#E8DCC7] flex items-center justify-between">
          <span>线路策略</span>
          <button class="text-[#8B8578] hover:text-[#C66B3D]" @click="strategyPanelOpen = false" title="折叠">&times;</button>
        </div>
        <button
          v-for="strategy in ROUTE_STRATEGIES"
          :key="strategy.value"
          :class="[
            'w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2',
            store.currentStrategy === strategy.value
              ? 'bg-[#FDF2EC] text-[#C66B3D] font-medium'
              : 'text-[#2D2A26] hover:bg-[#F5F0E8]',
          ]"
          :title="strategy.desc"
          @click="handleMapStrategyClick(strategy.value)"
        >
          <span>{{ strategy.label }}</span>
          <span v-if="store.currentStrategy === strategy.value" class="text-[#C66B3D] text-xs ml-auto">&#10003;</span>
        </button>
        <div class="px-3 py-1.5 text-[10px] text-[#B0A99F] bg-[#F5F0E8] border-t border-[#E8DCC7]">
          右栏已内嵌策略切换器
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-2 text-[11px] text-[#8B8578] max-w-[220px]">
        点击地图可添加地点或查找附近景点
      </div>
    </div>

    <!-- 右侧控件 -->
    <div class="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <div class="bg-white rounded-xl shadow-md overflow-hidden">
        <button
          class="w-9 h-9 flex items-center justify-center text-[#2D2A26] hover:bg-[#F5F0E8] transition-colors border-b border-[#E8DCC7]"
          @click="handleZoomIn"
        >
          <Icon icon="ph:plus" :width="16" :height="16" />
        </button>
        <button
          class="w-9 h-9 flex items-center justify-center text-[#2D2A26] hover:bg-[#F5F0E8] transition-colors"
          @click="handleZoomOut"
        >
          <Icon icon="ph:minus" :width="16" :height="16" />
        </button>
      </div>

      <button
        :class="[
          'bg-white w-9 h-9 rounded-xl shadow-md flex items-center justify-center transition-colors',
          isSatellite ? 'text-[#7EB8DA] bg-[#F0F7FB]' : 'text-[#2D2A26] hover:bg-[#F5F0E8]',
        ]"
        @click="handleToggleSatellite"
        :title="isSatellite ? '普通地图' : '卫星地图'"
      >
        <Icon :icon="isSatellite ? 'ph:map-trifold' : 'ph:globe'" :width="18" :height="18" />
      </button>
    </div>

    <!-- 搜索中提示 -->
    <div v-if="store.isSearchingPois" class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-4 py-3 rounded-xl shadow-lg z-20">
      <div class="flex items-center gap-2">
        <div class="animate-spin w-4 h-4 border-2 border-[#C66B3D] border-t-transparent rounded-full"></div>
        <span class="text-sm text-[#2D2A26]">搜索沿途景点...</span>
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
