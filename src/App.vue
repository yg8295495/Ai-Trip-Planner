<script setup lang="ts">
import { computed } from 'vue'
import { useTripStore } from './store/tripStore'
import AppLayout from './components/Layout/AppLayout.vue'
import ChatPanel from './components/ChatPanel/ChatPanel.vue'
import MapPanel from './components/MapPanel/MapPanel.vue'
import ItineraryStrip from './components/ItineraryStrip/ItineraryStrip.vue'
import PoiPanel from './components/PoiPanel/PoiPanel.vue'

const store = useTripStore()

// 只有用户点击"搜索沿途景点"后才显示 POI 面板
const showPoiPanel = computed(() => {
  return store.isSearchingPois || store.candidatePois.length > 0
})
</script>

<template>
  <AppLayout>
    <template #chat>
      <ChatPanel />
    </template>
    <template #map>
      <MapPanel />
    </template>
    <template #itinerary>
      <PoiPanel v-if="showPoiPanel" />
      <ItineraryStrip v-else />
    </template>
  </AppLayout>
</template>
