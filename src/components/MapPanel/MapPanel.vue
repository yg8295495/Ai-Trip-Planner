<script setup lang="ts">
import { watch, ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'
import MapClickPopup from './MapClickPopup.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPoiMarkers, renderRouteByREST, setStrategy, fitView, toggleSatellite, zoomIn, zoomOut, updateMap, onMapClick, getMap, addTempMarker } = useMap(mapContainer)

const selectedStrategy = ref(0)
const isSatellite = ref(false)
const clickPos = ref<{ lng: number; lat: number } | null>(null)
const tempMarker = ref<any>(null)

// 地图点击 -> 弹浮层 + 在地图上画临时 marker
onMapClick((lng, lat) => {
  const m = getMap()
  if (tempMarker.value && m) m.remove(tempMarker.value)
  clickPos.value = { lng, lat }
  tempMarker.value = addTempMarker(lng, lat, '#EF4444')
})

function closePopup() {
  const m = getMap()
  if (tempMarker.value && m) m.remove(tempMarker.value)
  tempMarker.value = null
  clickPos.value = null
}

// 监听路线信息变化，刷新地图
watch(
  () => store.routeInfo,
  () => {
    updateMap()
  },
  { deep: true }
)

// 监听起点终点变化，触发路线计算
watch(
  () => [store.params.origin, store.params.destination],
  async ([origin, dest]) => {
    if (origin && dest) {
      const routeInfo = await renderRouteByREST()
      if (routeInfo) {
        store.setRouteInfo(routeInfo)
      }
    }
  },
  { deep: true }
)

// 监听候选 POI 变化，在地图上显示
watch(
  () => store.candidatePois,
  () => {
    if (store.candidatePois.length > 0) {
      renderPoiMarkers(store.candidatePois)
    }
  },
  { deep: true }
)

// 监听选中的 POI，在地图上高亮
watch(
  () => store.selectedPois,
  () => {
    renderPoiMarkers(store.candidatePois)
  },
  { deep: true }
)

function handleStrategyChange(strategy: number) {
  selectedStrategy.value = strategy
  setStrategy(strategy)
}

function handleFitView() {
  fitView()
}

function handleToggleSatellite() {
  toggleSatellite()
  isSatellite.value = !isSatellite.value
}

function handleZoomIn() {
  zoomIn()
}

function handleZoomOut() {
  zoomOut()
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

    <!-- 左侧控制按钮 -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
      <button
        @click="handleFitView"
        class="bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        📍 归位
      </button>

      <div class="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          v-for="strategy in ROUTE_STRATEGIES"
          :key="strategy.value"
          :class="[
            'w-full px-3 py-2 text-sm text-left transition-colors flex items-center gap-2',
            selectedStrategy === strategy.value
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50',
          ]"
          @click="handleStrategyChange(strategy.value)"
        >
          <span>{{ strategy.icon }}</span>
          <span>{{ strategy.label }}</span>
        </button>
      </div>

      <div class="bg-white rounded-lg shadow-md p-2 text-xs text-gray-500 max-w-[200px]">
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
