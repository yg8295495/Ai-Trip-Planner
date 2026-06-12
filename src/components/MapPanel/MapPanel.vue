<script setup lang="ts">
import { watch, onMounted } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPoiMarkers, renderRouteByREST, setStrategy, fitView, toggleSatellite, zoomIn, zoomOut } = useMap(mapContainer)
import { ref } from 'vue'

const selectedStrategy = ref(0)
const isSatellite = ref(false)

// 监听起点终点变化，只有都设置后才计算路线
watch(
  () => [store.params.origin, store.params.destination],
  async ([origin, dest]) => {
    if (origin && dest) {
      const routeInfo = await renderRouteByREST()
      if (routeInfo) {
        store.setRouteInfo(routeInfo)
      }
    }
  }
)

// 监听已确认地点变化，重新计算路线
watch(
  () => store.confirmedLocations.length,
  async () => {
    if (store.params.origin && store.params.destination) {
      const routeInfo = await renderRouteByREST()
      if (routeInfo) {
        store.setRouteInfo(routeInfo)
      }
    }
  }
)

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

    <PinInfoCard
      v-if="store.selectedLocationId"
      :location="store.locations.find((l) => l.id === store.selectedLocationId)!"
      @close="store.setSelectedLocation(null)"
      @toggle="store.toggleLocation(store.selectedLocationId!)"
    />
  </div>
</template>
