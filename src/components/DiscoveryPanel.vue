<template>
  <div class="p-4 flex flex-col gap-3 bg-card/95 backdrop-blur-md shadow-2xl rounded-2xl border">
    <div class="flex items-center justify-between border-b pb-2">
      <span class="text-xs font-medium text-muted-foreground">沿途风景发现</span>
      <div class="flex bg-muted p-0.5 rounded-lg text-xs">
        <button 
          v-for="kms in [20, 30, 50]" :key="kms"
          @click="changeRadius(kms)"
          class="px-2.5 py-1 rounded-md transition-all"
          :class="poiStore.searchRadius === kms ? 'bg-background shadow-sm font-bold text-primary' : 'text-muted-foreground'"
        >
          {{ kms }}km
        </button>
      </div>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
      <button 
        @click="selectCategory('全部')"
        class="px-3 py-1.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all"
        :class="poiStore.selectedCategory === '全部' ? 'border-primary bg-primary/10 text-primary font-bold' : 'bg-background text-muted-foreground'"
      >
        <span>全部</span>
        <span class="bg-muted px-1.5 py-0.2 rounded-full text-[10px]">{{ poiStore.candidatePois.length }}</span>
      </button>
      
      <button 
        v-for="(count, cat) in categoriesWithCount" :key="cat"
        @click="selectCategory(cat)"
        class="px-3 py-1.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all"
        :class="poiStore.selectedCategory === cat ? 'border-primary bg-primary/10 text-primary font-bold' : 'bg-background text-muted-foreground'"
      >
        <span>{{ cat }}</span>
        <span class="bg-muted px-1.5 py-0.2 rounded-full text-[10px]">{{ count }}</span>
      </button>
    </div>

    <div class="flex gap-3 overflow-x-auto py-1 scrollbar-none min-h-[100px]">
      <div 
        v-for="poi in poiStore.filteredPois" :key="poi.poi_id"
        class="w-[180px] bg-muted/40 rounded-xl p-3 border shrink-0 flex flex-col justify-between hover:border-primary/50 transition-all"
      >
        <div>
          <div class="font-bold text-sm truncate" :title="poi.name">{{ poi.name }}</div>
          <div class="text-[10px] text-muted-foreground mt-0.5">⭐ {{ poi.score || '4.2' }} · {{ poi.category }}</div>
        </div>
        <button 
          @click="addPoiToItinerary(poi)"
          class="w-full mt-2 bg-primary text-primary-foreground text-xs py-1 rounded-lg font-medium hover:bg-primary/90 transition-all"
        >
          + 加入行程单
        </button>
      </div>
      <div v-if="poiStore.filteredPois.length === 0" class="w-full flex items-center justify-center text-xs text-muted-foreground">
        当前分类下无沿途景点
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouteStore } from '@/stores/routeStore'
import { usePoiStore } from '@/stores/poiStore'

const routeStore = useRouteStore()
const poiStore = usePoiStore()

function changeRadius(kms: number) {
  poiStore.searchRadius = kms
  routeStore.searchPoisByRoute()
}

function selectCategory(category: string) {
  console.log('Selecting category:', category)
  poiStore.selectedCategory = category
  console.log('poiStore.selectedCategory:', poiStore.selectedCategory)
}

// 动态计算分类及其包含的景点数量
const categoriesWithCount = computed(() => {
  const counts: Record<string, number> = {}
  poiStore.candidatePois.forEach(poi => {
    if (poi.category) {
      counts[poi.category] = (counts[poi.category] || 0) + 1
    }
  })
  return counts
})

// 点击加入右侧珍珠项链
function addPoiToItinerary(poi: any) {
  // 暂时桥接至 routeStore 的添加逻辑
  if (routeStore.addWaypoint) {
    routeStore.addWaypoint(poi)
  } else {
    // 兼容可能的一维珍珠链推入
    routeStore.waypoints.push({
      id: poi.poi_id,
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      isOvernight: false
    })
  }
}
</script>