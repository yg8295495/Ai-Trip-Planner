<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { useRouteStore } from '@/stores/routeStore'
import { Icon } from '@iconify/vue'

const emit = defineEmits<{ planned: [] }>()

const chatStore = useChatStore()
const routeStore = useRouteStore()

const originText = ref('')
const destText = ref('')
const isPlanning = ref(false)

const strategies = [
  { value: 2, label: '高速', icon: 'ph highway' },
  { value: 13, label: '国道', icon: 'ph road-horizon' },
  { value: 10, label: '智能', icon: 'ph brain' },
]
const selectedStrategy = ref(2)

const canPlan = computed(() => originText.value.trim() && destText.value.trim() && !isPlanning.value)

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=c866b4e29221cbc714a4fc78060f23b7`
    )
    const data = await res.json()
    if (data.status === '1' && data.geocodes?.length) {
      const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
      return { lat, lon }
    }
  } catch {}
  return null
}

async function handlePlan() {
  if (!canPlan.value) return

  isPlanning.value = true
  try {
    const [origin, dest] = await Promise.all([
      geocodeAddress(originText.value.trim()),
      geocodeAddress(destText.value.trim())
    ])
    if (!origin || !dest) return

    chatStore.params.origin = {
      lat: origin.lat, lon: origin.lon,
      name: originText.value.trim(), shortName: originText.value.trim(),
      formattedAddress: '', adcode: '', level: '',
      province: '', city: '', district: ''
    }
    chatStore.params.destination = {
      lat: dest.lat, lon: dest.lon,
      name: destText.value.trim(), shortName: destText.value.trim(),
      formattedAddress: '', adcode: '', level: '',
      province: '', city: '', district: ''
    }

    await routeStore.computeAndSetRoute(origin, dest, selectedStrategy.value)
    emit('planned')
  } finally {
    isPlanning.value = false
  }
}
</script>

<template>
  <div class="p-3 space-y-3 border-b" style="border-color: var(--color-border)">
    <!-- 起终点输入 -->
    <div class="space-y-2">
      <div class="relative">
        <div class="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500"></div>
        <input
          v-model="originText"
          placeholder="出发地（如：成都）"
          class="w-full pl-7 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          style="border-color: var(--color-border)"
        />
      </div>
      <div class="relative">
        <div class="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500"></div>
        <input
          v-model="destText"
          placeholder="目的地（如：康定）"
          class="w-full pl-7 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          style="border-color: var(--color-border)"
          @keyup.enter="handlePlan"
        />
      </div>
    </div>

    <!-- 策略选择 -->
    <div class="flex gap-1.5">
      <button
        v-for="s in strategies"
        :key="s.value"
        class="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border transition-all"
        :class="selectedStrategy === s.value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background border-border hover:bg-muted text-muted-foreground'"
        @click="selectedStrategy = s.value"
      >
        <Icon :icon="s.icon" class="w-3.5 h-3.5" />
        {{ s.label }}
      </button>
    </div>

    <!-- 规划按钮 -->
    <Button
      class="w-full"
      size="sm"
      :disabled="!canPlan"
      @click="handlePlan"
    >
      <Icon v-if="isPlanning" icon="ph:spinner" class="w-4 h-4 mr-1.5 animate-spin" />
      {{ isPlanning ? '规划中...' : '开始规划' }}
    </Button>
  </div>
</template>
