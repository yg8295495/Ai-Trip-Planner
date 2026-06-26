<script setup lang="ts">
import { ref } from 'vue'
import { Radar, Tent, Waves, Camera, Baby, X, Edit2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePoiStore } from '@/stores/poiStore'

const poiStore = usePoiStore()

const radarState = ref<'hint' | 'expanded' | 'active'>('hint')
const searchRadius = ref([15])
const selectedTags = ref<string[]>([])
const isSearching = ref(false)

const tagOptions = [
  { value: 'camp', label: '露营', icon: Tent },
  { value: 'water', label: '野水', icon: Waves },
  { value: 'photo', label: '机位', icon: Camera },
  { value: 'family', label: '亲子', icon: Baby },
]

const tagMap: Record<string, string[]> = {
  camp: ['camp_site', 'caravan_site'],
  water: ['water', 'stream', 'river', 'lake', 'waterfall'],
  photo: ['viewpoint', 'peak', 'cliff'],
  family: ['playground', 'park', 'nature_reserve']
}

const resultCount = ref(0)

const expandRadar = () => {
  radarState.value = 'expanded'
}

const fireRadar = async () => {
  const bounds = poiStore.lastBounds
  if (!bounds) return

  isSearching.value = true
  try {
    const km = searchRadius.value[0]
    const latOffset = km / 111
    const lngOffset = km / (111 * Math.cos((bounds.min_lat + bounds.max_lat) / 2 * Math.PI / 180))

    const params = new URLSearchParams({
      min_lat: (bounds.min_lat - latOffset).toString(),
      max_lat: (bounds.max_lat + latOffset).toString(),
      min_lng: (bounds.min_lng - lngOffset).toString(),
      max_lng: (bounds.max_lng + lngOffset).toString(),
      limit: '30'
    })

    const res = await fetch(`/api/pois/osm-discover?${params}`)
    const data = await res.json()

    const allowedTags = selectedTags.value.flatMap(t => tagMap[t] || [])
    const filtered = (data.osm_pois || []).filter((poi: any) =>
      allowedTags.some(tag =>
        poi.specific_tag?.toLowerCase().includes(tag) ||
        poi.primary_tag?.toLowerCase().includes(tag)
      )
    )

    resultCount.value = filtered.length
    poiStore.osmPois = filtered
    radarState.value = 'active'
  } catch (err) {
    console.error('[MicroRadar] search failed:', err)
  } finally {
    isSearching.value = false
  }
}

const clearRadar = () => {
  selectedTags.value = []
  searchRadius.value = [15]
  radarState.value = 'hint'
}
</script>

<template>
  <div v-auto-animate class="my-4 flex flex-col items-center w-full relative">
    <div class="absolute inset-y-0 left-1/2 w-0.5 bg-border -translate-x-1/2 z-0"></div>

    <div v-if="radarState === 'hint'" class="z-10 relative bg-background px-2">
      <Button
        variant="outline"
        size="sm"
        class="rounded-full shadow-sm animate-pulse text-muted-foreground hover:text-primary transition-colors border-dashed"
        @click="expandRadar"
      >
        <Radar class="w-4 h-4 mr-2" />
        扫描沿途小众驻点
      </Button>
    </div>

    <div v-else-if="radarState === 'expanded'" class="z-10 w-full max-w-sm bg-card border shadow-lg rounded-xl p-5 space-y-6">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-semibold flex items-center">
          <Radar class="w-4 h-4 mr-2 text-primary" />
          微观雷达参数
        </h4>
        <Button variant="ghost" size="icon" class="h-6 w-6" @click="clearRadar">
          <X class="w-4 h-4" />
        </Button>
      </div>

      <div class="space-y-3">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>偏离主干道距离</span>
          <span class="font-mono text-primary">{{ searchRadius[0] }} km</span>
        </div>
        <Slider
          v-model="searchRadius"
          :min="1" :max="50" :step="1"
          class="cursor-grab active:cursor-grabbing"
        />
      </div>

      <div class="space-y-2">
        <span class="text-xs text-muted-foreground">寻找特征</span>
        <ToggleGroup type="multiple" v-model="selectedTags" class="justify-start flex-wrap gap-2">
          <ToggleGroupItem
            v-for="tag in tagOptions"
            :key="tag.value"
            :value="tag.value"
            class="rounded-full border bg-background data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-all"
            size="sm"
          >
            <component :is="tag.icon" class="w-3 h-3 mr-1.5" />
            {{ tag.label }}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Button class="w-full shadow-md" @click="fireRadar" :disabled="selectedTags.length === 0 || isSearching">
        {{ isSearching ? '搜索中...' : '发射雷达' }}
      </Button>
    </div>

    <div v-else-if="radarState === 'active'" class="z-10 relative bg-background px-2">
      <div class="flex items-center bg-emerald-50 border-emerald-200 border text-emerald-700 px-3 py-1.5 rounded-full text-xs shadow-sm font-medium">
        <Radar class="w-3.5 h-3.5 mr-1.5" />
        沿途 {{ searchRadius[0] }}km : 发现 {{ resultCount }} 处目标

        <div class="w-px h-3 bg-emerald-300 mx-2"></div>

        <button @click="expandRadar" class="hover:text-emerald-900 transition-colors" title="编辑参数">
          <Edit2 class="w-3.5 h-3.5" />
        </button>
        <button @click="clearRadar" class="ml-2 hover:text-emerald-900 transition-colors" title="清除扫描">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
