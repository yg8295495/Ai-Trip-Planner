<script setup lang="ts">
import { watch, ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import { searchPoisByCities, POI_TYPES } from '@/services/poiSearch'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPoiMarkers, renderRouteByREST, setStrategy, fitView, toggleSatellite, zoomIn, zoomOut } = useMap(mapContainer)

const selectedStrategy = ref(0)
const isSatellite = ref(false)

// 监听路线信息变化，自动搜索沿途景点
watch(
  () => store.routeInfo,
  async (routeInfo) => {
    if (routeInfo && routeInfo.cities.length > 0) {
      // 自动搜索沿途景点
      store.isSearchingPois = true
      const types = POI_TYPES.all
      const results = await searchPoisByCities(routeInfo.cities, types, 5)
      
      const allPois: any[] = []
      results.forEach((pois) => {
        allPois.push(...pois)
      })
      
      store.setCandidatePois(allPois)
      store.isSearchingPois = false
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
