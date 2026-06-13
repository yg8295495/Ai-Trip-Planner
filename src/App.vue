<script setup lang="ts">
import AppLayout from './components/Layout/AppLayout.vue'
import ChatPanel from './components/ChatPanel/ChatPanel.vue'
import MapPanel from './components/MapPanel/MapPanel.vue'
import ItineraryStrip from './components/ItineraryStrip/ItineraryStrip.vue'
import PoiDrawer from './components/PoiDrawer/PoiDrawer.vue'
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
      <ItineraryStrip />
    </template>
  </AppLayout>
  <PoiDrawer />
</template>
