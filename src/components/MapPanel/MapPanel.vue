<script setup lang="ts">
import { ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useMap } from '@/composables/useMap'
import PinInfoCard from './PinInfoCard.vue'

const store = useTripStore()
const mapContainer = ref<HTMLElement | null>(null)
const { renderPins, renderRoute } = useMap(mapContainer)

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
