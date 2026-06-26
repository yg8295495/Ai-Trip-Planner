<template>
  <div v-if="!isMobile" class="h-screen w-screen flex flex-col overflow-hidden bg-background font-sans select-none text-foreground">
    
    <div v-if="routeStore.tripSummary" class="h-10 border-b flex items-center justify-between px-4 bg-muted/50 z-50">
      <div class="flex items-center gap-2 text-xs">
        <span class="font-bold">自驾舱</span>
        <span class="text-muted-foreground">|</span>
        <span>{{ routeStore.tripSummary.totalKm }} km</span>
        <span class="text-muted-foreground">•</span>
        <span>{{ routeStore.tripSummary.totalHours }} 小时</span>
      </div>
      <div class="text-xs font-medium text-muted-foreground">全程规划</div>
    </div>

    <div class="flex-1 flex min-h-0 relative">
      <div class="h-full border-r flex flex-col bg-card transition-all duration-300 ease-in-out relative z-40" :class="chatCollapsed ? 'w-12' : 'w-[360px]'">
        <div v-if="chatCollapsed" class="flex flex-col items-center pt-4"><button @click="chatCollapsed = false" class="p-2 hover:bg-muted rounded-md">💬</button></div>
        <div v-else class="flex-1 flex flex-col min-h-0">
          <div class="p-4 border-b flex items-center justify-between">
            <h1 class="font-bold bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">MiMo Auto</h1>
            <button @click="chatCollapsed = true" class="text-xs hover:underline">◂ 收起</button>
          </div>
          <div class="p-4 border-b bg-muted/20"><TripInput /></div>
          <div class="flex-1 min-h-0"><ChatPanel /></div>
        </div>
      </div>

      <div class="flex-1 h-full min-w-0 relative bg-muted/10">
        <MapPanel class="w-full h-full absolute inset-0 z-10" />
        <div v-if="routeStore.tripSummary" class="absolute bottom-6 left-1/2 -translate-x-1/2 w-[600px] bg-card/90 backdrop-blur shadow-2xl rounded-2xl border z-20">
          <DiscoveryPanel />
        </div>
      </div>

      <div class="h-full w-[300px] border-l bg-card z-30"><ItineraryStrip /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouteStore } from '@/stores/routeStore'
import TripInput from '@/components/TripInput/TripInput.vue'
import ChatPanel from '@/components/ChatPanel/ChatPanel.vue'
import MapPanel from '@/components/MapPanel/MapPanel.vue'
import DiscoveryPanel from '@/components/DiscoveryPanel.vue'
import ItineraryStrip from '@/components/ItineraryStrip/ItineraryStrip.vue'

const routeStore = useRouteStore()
const chatCollapsed = ref(false)

// 移动端检测
const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 768)

function handleResize() {
  windowWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))

// 规划成功自动收起左栏
watch(() => routeStore.tripSummary, (newVal) => {
  if (newVal) chatCollapsed.value = true
})
</script>