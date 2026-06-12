<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { updateMap } = useMap(mapContainer)

watch(
  () => [store.confirmedLocations.length, store.selectedLocationId],
  () => {
    updateMap()
  }
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
