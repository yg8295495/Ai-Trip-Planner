<script setup lang="ts">
import { ref } from 'vue'
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
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <h2 class="text-base font-semibold text-gray-800">行程规划</h2>
    </div>

    <!-- 初始占位：起点终点 -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <div class="w-0.5 h-6 bg-gray-200"></div>
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div class="flex-1 space-y-2">
          <div>
            <p class="text-xs text-gray-400">起点</p>
            <p class="text-sm font-medium text-gray-800">
              {{ store.params.origin?.shortName || '待输入' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">终点</p>
            <p class="text-sm font-medium text-gray-800">
              {{ store.params.destination?.shortName || '待输入' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 路线信息 -->
    <div v-if="store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ (store.routeInfo.distance / 1000).toFixed(0) }}</p>
          <p class="text-xs text-gray-400">公里</p>
        </div>
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ (store.routeInfo.duration / 3600).toFixed(1) }}</p>
          <p class="text-xs text-gray-400">小时</p>
        </div>
        <div>
          <p class="text-lg font-semibold text-blue-600">{{ store.routeInfo.cities.length }}</p>
          <p class="text-xs text-gray-400">城市</p>
        </div>
      </div>
    </div>

    <!-- 偏离距离设置 -->
    <div v-if="store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <p class="text-sm font-medium text-gray-700 mb-2">沿途探索范围</p>
      <div class="flex items-center gap-3">
        <input
          v-model.number="deviationInput"
          type="range"
          min="10"
          max="100"
          step="10"
          class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span class="text-sm font-medium text-blue-600 w-14 text-right">
          {{ deviationInput }}km
        </span>
      </div>
    </div>

    <!-- 类型选择 -->
    <div v-if="store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="flex gap-2">
        <button
          v-for="option in typeOptions"
          :key="option.value"
          :class="[
            'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
            selectedType === option.value
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          ]"
          @click="selectedType = option.value"
        >
          {{ option.icon }} {{ option.label }}
        </button>
      </div>
      <button
        :disabled="store.isSearchingPois"
        class="w-full mt-3 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 transition-colors"
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

      <div v-if="store.isSearchingPois" class="text-center py-8">
        <div class="inline-flex gap-1">
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
        </div>
        <p class="text-sm text-gray-500 mt-2">搜索中...</p>
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
    <div v-if="showPoiList && store.selectedPois.length > 0" class="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-white">
      <button
        class="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-green-500 hover:bg-green-600 transition-colors"
        @click="handleConfirm"
      >
        确认选择 ({{ store.selectedPois.length }}个)
      </button>
    </div>
  </div>
</template>
