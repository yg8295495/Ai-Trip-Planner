<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap, ROUTE_STRATEGIES } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPoiMarkers, renderRouteByREST, setStrategy, fitView } = useMap(mapContainer)
const selectedStrategy = ref(0)

onMounted(async () => {
  if (store.params.origin && store.params.destination) {
    const routeInfo = await renderRouteByREST()
    if (routeInfo) {
      store.setRouteInfo(routeInfo)
    }
  }
})

watch(
  () => store.confirmedLocations.length,
  async () => {
    const routeInfo = await renderRouteByREST()
    if (routeInfo) {
      store.setRouteInfo(routeInfo)
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
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="mapContainer" class="h-full w-full" />

    <!-- 地图控制按钮 -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-2">
      <!-- 归位按钮 -->
      <button
        @click="handleFitView"
        class="bg-white px-3 py-2 rounded-lg shadow-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
      >
        📍 归位
      </button>

      <!-- 路线策略选择 -->
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

    <PinInfoCard
      v-if="store.selectedLocationId"
      :location="store.locations.find((l) => l.id === store.selectedLocationId)!"
      @close="store.setSelectedLocation(null)"
      @toggle="store.toggleLocation(store.selectedLocationId!)"
    />
  </div>
</template>
