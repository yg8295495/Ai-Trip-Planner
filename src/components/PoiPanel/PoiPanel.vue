<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { searchPoisByCities, POI_TYPES } from '@/services/poiSearch'
import PoiCard from './PoiCard.vue'

const store = useTripStore()

const deviationInput = ref(30)
const selectedType = ref<string>('scenic')
const showPoiList = ref(false)

const typeOptions = [
  { value: 'scenic', label: '景点', icon: '🏔️' },
  { value: 'food', label: '美食', icon: '🍜' },
  { value: 'hotel', label: '住宿', icon: '🏨' },
]

async function handleSearch() {
  if (!store.routeInfo || store.routeInfo.cities.length === 0) return

  store.setMaxDeviation(deviationInput.value)
  store.isSearchingPois = true
  showPoiList.value = true

  const types = POI_TYPES[selectedType.value as keyof typeof POI_TYPES]
  const cities = store.routeInfo.cities

  const results = await searchPoisByCities(cities, types, 5)

  const allPois: any[] = []
  results.forEach((pois) => {
    allPois.push(...pois)
  })

  store.setCandidatePois(allPois)
  store.isSearchingPois = false
}

function handleConfirm() {
  store.confirmPoisAsWaypoints()
  showPoiList.value = false
}

function handleClose() {
  showPoiList.value = false
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 路线信息 -->
    <div v-if="store.routeInfo" class="border-b border-gray-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-gray-800">最优路径</h3>
      <p class="text-xs text-gray-500 mt-1">
        {{ (store.routeInfo.distance / 1000).toFixed(0) }}km ·
        {{ (store.routeInfo.duration / 3600).toFixed(1) }}小时 ·
        {{ store.routeInfo.cities.length }}个城市
      </p>
    </div>

    <!-- 偏离距离设置 -->
    <div class="border-b border-gray-200 px-4 py-3">
      <h3 class="text-sm font-semibold text-gray-800">沿途探索</h3>
      <p class="text-xs text-gray-500 mt-1">
        你能接受偏离最优路径多远？
      </p>
      <div class="flex items-center gap-2 mt-2">
        <input
          v-model.number="deviationInput"
          type="range"
          min="10"
          max="100"
          step="10"
          class="flex-1"
        />
        <span class="text-sm font-medium text-blue-600 w-12 text-right">
          {{ deviationInput }}km
        </span>
      </div>
    </div>

    <!-- 类型选择 -->
    <div class="border-b border-gray-200 px-4 py-3">
      <div class="flex gap-2">
        <button
          v-for="option in typeOptions"
          :key="option.value"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            selectedType === option.value
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          ]"
          @click="selectedType = option.value"
        >
          {{ option.icon }} {{ option.label }}
        </button>
      </div>
    </div>

    <!-- 搜索按钮 -->
    <div class="px-4 py-3">
      <button
        :disabled="!store.routeInfo || store.isSearchingPois"
        class="w-full py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="handleSearch"
      >
        {{ store.isSearchingPois ? '搜索中...' : '搜索沿途景点' }}
      </button>
    </div>

    <!-- POI 列表 -->
    <div v-if="showPoiList" class="flex-1 overflow-y-auto px-4 py-2">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700">
          找到 {{ store.candidatePois.length }} 个景点
        </span>
        <button
          class="text-xs text-gray-500 hover:text-gray-700"
          @click="handleClose"
        >
          收起
        </button>
      </div>

      <div v-if="store.isSearchingPois" class="text-center py-4 text-gray-500 text-sm">
        搜索中...
      </div>

      <div v-else class="space-y-2">
        <PoiCard
          v-for="poi in store.candidatePois"
          :key="poi.id"
          :poi="poi"
          :is-selected="store.selectedPois.some((p) => p.id === poi.id)"
          @toggle="store.togglePoiSelection(poi)"
        />
      </div>
    </div>

    <!-- 确认按钮 -->
    <div v-if="showPoiList && store.selectedPois.length > 0" class="px-4 py-3 border-t border-gray-200">
      <button
        class="w-full py-2 rounded-lg text-sm font-medium text-white bg-green-500 hover:bg-green-600"
        @click="handleConfirm"
      >
        确认选择 ({{ store.selectedPois.length }}个)
      </button>
    </div>
  </div>
</template>
