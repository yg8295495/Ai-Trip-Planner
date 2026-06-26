<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chatStore'
import { useRouteStore } from '@/stores/routeStore'
import { usePoiStore } from '@/stores/poiStore'
import { CtripMarkerManager } from '@/composables/useCtripMarkers'
import { getCurrentPosition } from '@/services/amapGeolocation'

const chatStore = useChatStore()
const routeStore = useRouteStore()
const poiStore = usePoiStore()

const mapContainer = ref<HTMLElement | null>(null)
let mapInstance: any = null
let markerManager: CtripMarkerManager | null = null
let resizeObserver: ResizeObserver | null = null

// UI 状态
const isSatellite = ref(false)
const strategyPanelOpen = ref(false)
const categoryPanelOpen = ref(false)
const showMapHint = ref(false)

// 全局桥接：InfoWindow 点击 "+ 加入自驾行程单"
;(window as any).__addToItinerary = (poiId: string) => {
  const poi = poiStore.candidatePois.find(p => p.poi_id === poiId) ||
              poiStore.candidatePois.find(p => p.poi_id === poiId)
  if (poi) {
    routeStore.addWaypoint({
      poi_id: poi.poi_id || poi.id,
      name: poi.name,
      lat: poi.lat || Number(poi.location?.split(',')[1]),
      lng: poi.lng || Number(poi.location?.split(',')[0]),
      keytag: poi.keytag || poi.rating || '',
      score: poi.score || Number(poi.cost) || 4.5,
      comment_count: poi.comment_count || 100,
      category: poi.category || poi.type || '自然山水'
    })
  }
}

onMounted(async () => {
  if (!mapContainer.value || !(window as any).AMap) return

  // 1. 获取用户位置
  let defaultCenter: [number, number] = [116.40, 39.90]
  try {
    const pos = await getCurrentPosition()
    if (pos && pos.lat && pos.lng) {
      defaultCenter = [pos.lng, pos.lat]
    }
  } catch {}

  // 2. 初始化高德地图
  mapInstance = new (window as any).AMap.Map(mapContainer.value, {
    zoom: 11,
    center: defaultCenter,
    viewMode: '2D'
  })

  // 3. 监听 resize
  resizeObserver = new ResizeObserver(() => {
    if (mapInstance) mapInstance.resize()
  })
  resizeObserver.observe(mapContainer.value)

  // 4. 地图就绪
  mapInstance.on('complete', () => {
    markerManager = new CtripMarkerManager(mapInstance)
    markerManager.initReactiveBridge(poiStore, routeStore)
  })

  // 5. 起终点标记
  watch(
    () => chatStore.params.origin,
    (origin) => {
      if (!origin || origin.lat == null || origin.lon == null) return
      addEndpointMarker('origin', origin.lon, origin.lat, origin.shortName || '起点')
      if (mapInstance) mapInstance.setZoomAndCenter(10, [origin.lon, origin.lat])
    },
    { immediate: true, deep: true }
  )
  watch(
    () => chatStore.params.destination,
    (dest) => {
      if (!dest || dest.lat == null || dest.lon == null) return
      addEndpointMarker('dest', dest.lon, dest.lat, dest.shortName || '终点')
    },
    { immediate: true, deep: true }
  )

  // 6. 路线数据 → 画线 + 搜索
  watch(
    () => routeStore.routeInfo,
    async (info) => {
      if (!mapInstance || !info || !info.polyline || info.polyline.length === 0) return

      renderRoute(info)

      try {
        if (routeStore.isComputingRoute) return
        await routeStore.searchPoisByRoute()
      } catch (err) {
        console.error('[MapPanel 长廊缝合失败]:', err)
      }
    },
    { deep: true }
  )
})

onBeforeUnmount(() => {
  if (markerManager) markerManager.destroy()
  if (mapInstance) mapInstance.destroy()
  if (resizeObserver) resizeObserver.disconnect()
})

// ========== 辅助函数 ==========

function addEndpointMarker(type: string, lng: number, lat: number, label: string) {
  if (!mapInstance) return
  const color = type === 'origin' ? '#10B981' : '#EF4444'
  const marker = new (window as any).AMap.Marker({
    position: [lng, lat],
    title: label,
    label: {
      content: `<div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
      direction: 'top',
      offset: new (window as any).AMap.Pixel(0, -10)
    }
  })
  mapInstance.add(marker)
}

function renderRoute(info: any) {
  if (!mapInstance) return
  mapInstance.clearMap()
  if (chatStore.params.origin) addEndpointMarker('origin', chatStore.params.origin.lon, chatStore.params.origin.lat, chatStore.params.origin.shortName || '起点')
  if (chatStore.params.destination) addEndpointMarker('dest', chatStore.params.destination.lon, chatStore.params.destination.lat, chatStore.params.destination.shortName || '终点')
  const polyline = new (window as any).AMap.Polyline({
    path: info.polyline, strokeColor: '#3B82F6', strokeWeight: 6, strokeOpacity: 0.8
  })
  mapInstance.add(polyline)
  mapInstance.setFitView()
}

// ========== 控件事件 ==========

function handleFitView() { if (mapInstance) mapInstance.setFitView() }
function handleToggleSatellite() { isSatellite.value = !isSatellite.value }
function handleZoomIn() { if (mapInstance) mapInstance.zoomIn() }
function handleZoomOut() { if (mapInstance) mapInstance.zoomOut() }

function handleCategoryClick(category: string) {
  if (poiStore.selectedCategory === category) {
    poiStore.clearSelectedCategory()
  } else {
    poiStore.setSelectedCategory(category)
  }
}

function handleClearCategory() {
  poiStore.clearSelectedCategory()
}

function handleSearchOsm() {
  if (poiStore.lastBounds) poiStore.discoverOsmPois(poiStore.lastBounds)
}
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <div ref="mapContainer" class="h-full w-full" />

    <!-- 顶置罗盘标签 -->
    <div class="absolute top-4 left-4 right-16 z-10 flex flex-col gap-2 pointer-events-none">
      <div class="flex items-center gap-2 pointer-events-auto">
        <button @click="categoryPanelOpen = !categoryPanelOpen"
          class="flex h-10 items-center gap-2 px-4 rounded-xl shadow-lg border backdrop-blur transition-all active:scale-95"
          style="background: rgba(255,255,255,0.85); border-color: var(--color-border); color: var(--color-text)">
          <Icon icon="ph:compass-duotone" class="w-5 h-5" style="color: var(--color-primary)" />
          <span class="text-xs font-semibold tracking-wide">沿途风景发现</span>
          <Icon :icon="categoryPanelOpen ? 'ph:caret-up' : 'ph:caret-down'" class="w-3 h-3 opacity-60" />
        </button>
        <button v-if="poiStore.selectedCategory" @click="handleClearCategory"
          class="h-7 text-[11px] px-2.5 rounded-lg border border-dashed flex items-center gap-1 transition-colors"
          style="background: rgba(239,68,68,0.1); color: #EF4444; border-color: #EF4444">
          <span>清除: {{ poiStore.selectedCategory }}</span>
          <Icon icon="ph:x" class="w-3 h-3" />
        </button>
      </div>
      <div v-if="categoryPanelOpen" class="p-3 rounded-2xl shadow-xl border backdrop-blur" style="background: rgba(255,255,255,0.9); border-color: var(--color-border)">
        <div class="flex flex-wrap gap-1.5">
          <button v-for="cat in poiStore.CATEGORIES" :key="cat"
            class="h-8 px-3 rounded-lg text-xs font-normal transition-all"
            :style="poiStore.selectedCategory === cat ? { background: 'var(--color-primary)', color: 'white' } : { background: 'var(--color-surface-alt)', color: 'var(--color-text)' }"
            @click="handleCategoryClick(cat)">
            {{ cat }}
          </button>
        </div>
      </div>
    </div>

    <!-- 右侧控件 -->
    <div class="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
      <button @click="handleFitView"
        class="w-10 h-10 rounded-xl shadow-lg flex items-center justify-center border backdrop-blur"
        style="background: rgba(255,255,255,0.85); border-color: var(--color-border); color: var(--color-text)"
        title="归位">
        <Icon icon="ph:frame-corners" class="w-5 h-5" />
      </button>
    </div>

    <!-- 加载遮罩 -->
    <div v-if="poiStore.isLoading || routeStore.isComputingRoute"
      class="absolute inset-0 z-50 flex items-center justify-center transition-all"
      style="background: rgba(255,255,255,0.1); backdrop-filter: blur(1px)">
      <div class="border shadow-2xl rounded-2xl px-5 py-3.5 flex items-center gap-3"
        style="background: var(--color-surface); border-color: var(--color-border)">
        <div class="animate-spin w-5 h-5 border-2 border-t-transparent rounded-full"
          style="border-color: var(--color-primary)"></div>
        <span class="text-xs font-medium tracking-wide">正在缝合自驾时廊...</span>
      </div>
    </div>
  </div>
</template>
