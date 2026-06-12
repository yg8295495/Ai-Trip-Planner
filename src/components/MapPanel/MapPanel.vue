<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { updateMap, renderPoiMarkers, getRouteInfo, renderRouteByREST } = useMap(mapContainer)

// 初始化时计算路线并保存到 store
onMounted(async () => {
  if (store.params.origin && store.params.destination) {
    const routeInfo = await renderRouteByREST()
    if (routeInfo) {
      store.setRouteInfo(routeInfo)
    }
  }
})

// 监听 confirmedLocations 变化
watch(
  () => store.confirmedLocations.length,
  async () => {
    const routeInfo = await renderRouteByREST()
    if (routeInfo) {
      store.setRouteInfo(routeInfo)
    }
  }
)

// 监听候选 POI 变化，在地图上显示
watch(
  () => store.candidatePois,
  (pois) => {
    if (pois.length > 0) {
      renderPoiMarkers(pois)
    }
  },
  { deep: true }
)

// 监听选中的 POI，在地图上高亮
watch(
  () => store.selectedPois,
  (pois) => {
    // 高亮选中的 POI
    renderPoiMarkers(store.candidatePois)
  },
  { deep: true }
)

function closeInfoCard() {
  store.setSelectedLocation(null)
}
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="mapContainer" class="h-full w-full" />
    <PinInfoCard
      v-if="store.selectedLocationId"
      :location="store.locations.find((l) => l.id === store.selectedLocationId)!"
      @close="closeInfoCard"
      @toggle="store.toggleLocation(store.selectedLocationId!)"
    />
  </div>
</template>
