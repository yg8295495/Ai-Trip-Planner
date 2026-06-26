<script setup lang="ts">
import { ref, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useRouteStore } from '@/stores/routeStore'
import { Button } from '@/components/ui/button'
import { Icon } from '@iconify/vue'

const routeStore = useRouteStore()

const activeDay = ref(0)
const showQrModal = ref(false)
const qrData = ref('')

const dayTabs = computed(() => {
  return routeStore.routeByDays.map((day, i) => {
    const totalKm = day.reduce((sum, wp, idx) => {
      if (idx === 0) return sum
      const prev = day[idx - 1].poi_details
      const curr = wp.poi_details
      const R = 6371
      const dLat = (curr.lat - prev.lat) * Math.PI / 180
      const dLon = (curr.lng - prev.lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2
      return sum + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }, 0)
    return {
      index: i,
      label: `D${i + 1}`,
      count: day.length,
      km: Math.round(totalKm)
    }
  })
})

const currentDayWaypoints = computed(() => {
  return routeStore.routeByDays[activeDay.value] || []
})

function handleDragEnd() {
  routeStore.reorderWaypoints([...routeStore.waypoints])
}

function generateQrData() {
  const day = routeStore.routeByDays[activeDay.value]
  if (!day || day.length < 2) return

  const first = day[0].poi_details
  const last = day[day.length - 1].poi_details
  const midPoints = day.slice(1, -1)

  let uri = `amapuri://route/plan/?`
  uri += `slat=${first.lat}&slon=${first.lng}&sname=${encodeURIComponent(first.name)}`
  uri += `&dlat=${last.lat}&dlon=${last.lng}&dname=${encodeURIComponent(last.name)}`

  if (midPoints.length > 0) {
    const pts = midPoints.map(wp => `${wp.poi_details.lng},${wp.poi_details.lat}`).join(';')
    uri += `&via=1&viaPoints=${encodeURIComponent(pts)}`
  }
  uri += `&dev=0&m=0`

  qrData.value = uri
  showQrModal.value = true
}

function closeQrModal() {
  showQrModal.value = false
  qrData.value = ''
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Day 标签 -->
    <div class="flex gap-1 p-2 overflow-x-auto border-b flex-shrink-0" style="border-color: var(--color-border)">
      <button
        v-for="tab in dayTabs"
        :key="tab.index"
        class="px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-all flex items-center gap-1"
        :class="activeDay === tab.index
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted hover:bg-muted/80 text-muted-foreground'"
        @click="activeDay = tab.index"
      >
        <span class="font-medium">{{ tab.label }}</span>
        <span class="opacity-60">{{ tab.count }}点</span>
        <span v-if="tab.km > 0" class="opacity-50 text-[10px]">{{ tab.km }}km</span>
      </button>
    </div>

    <!-- 当天途经点列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <VueDraggable
        v-model="routeStore.waypoints"
        :group="{ name: 'waypoints' }"
        handle=".drag-handle"
        :animation="150"
        @end="handleDragEnd"
      >
        <div
          v-for="(wp, idx) in currentDayWaypoints"
          :key="wp.id"
          class="flex items-center gap-2 p-2 mb-1 rounded-lg border bg-card transition-all hover:shadow-sm group"
          style="border-color: var(--color-border)"
        >
          <span class="drag-handle cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">⠿</span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ wp.poi_details.name }}</div>
            <div v-if="wp.poi_details.keytag" class="text-[10px] text-muted-foreground">{{ wp.poi_details.keytag }}</div>
          </div>
          <button
            class="text-[10px] px-1.5 py-0.5 rounded border transition-colors flex-shrink-0"
            :class="wp.isOvernight
              ? 'bg-amber-50 text-amber-600 border-amber-200'
              : 'bg-background border-border text-muted-foreground hover:bg-muted'"
            @click="routeStore.toggleOvernight(wp.id)"
          >
            {{ wp.isOvernight ? '🌙 宿' : '过夜' }}
          </button>
          <button
            class="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            @click="routeStore.removeWaypoint(wp.id)"
          >
            <Icon icon="ph:x" class="w-3.5 h-3.5" />
          </button>
        </div>
      </VueDraggable>

      <div v-if="currentDayWaypoints.length === 0" class="text-center text-muted-text text-sm py-8">
        <Icon icon="ph:map-pin" class="w-8 h-8 mx-auto mb-2 opacity-30" />
        点击地图景点加入行程
      </div>
    </div>

    <!-- 底部操作 -->
    <div v-if="routeStore.waypoints.length > 0" class="p-2 border-t flex gap-2 flex-shrink-0" style="border-color: var(--color-border)">
      <Button variant="outline" size="sm" class="flex-1" @click="generateQrData">
        <Icon icon="ph:qr-code" class="w-4 h-4 mr-1" />
        导出导航
      </Button>
    </div>

    <!-- QR Modal -->
    <Teleport to="body">
      <div v-if="showQrModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="closeQrModal">
        <div class="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold">高德导航链接</h3>
            <button @click="closeQrModal" class="text-muted-foreground hover:text-foreground">
              <Icon icon="ph:x" class="w-4 h-4" />
            </button>
          </div>
          <p class="text-xs text-muted-foreground mb-3">复制以下链接，在手机上打开即可唤起高德地图：</p>
          <textarea
            :value="qrData"
            readonly
            class="w-full h-20 p-2 text-xs rounded-lg border bg-muted font-mono resize-none"
            style="border-color: var(--color-border)"
            @click="($event.target as HTMLTextAreaElement).select()"
          />
          <Button class="w-full mt-3" size="sm" @click="navigator.clipboard.writeText(qrData)">
            <Icon icon="ph:copy" class="w-4 h-4 mr-1" />
            复制链接
          </Button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
