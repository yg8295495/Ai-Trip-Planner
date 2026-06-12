<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import DayCard from './DayCard.vue'

const store = useTripStore()

// 表单数据
const originInput = ref(store.params.origin?.query || '')
const destinationInput = ref(store.params.destination?.query || '')
const totalDays = ref(store.params.totalDays || 7)
const dailyDrivingLimit = ref(store.params.dailyDrivingLimitHours || 5)
const deviationDistance = ref(store.maxDeviation || 30)
const selectedStrategy = ref(0)

// 是否已确认路线
const isConfirmed = computed(() => {
  return store.params.origin && store.params.destination && store.routeInfo
})

// 地理编码缓存
const geocodeCache = ref<Map<string, { lat: number; lon: number }>>(new Map())

// 监听起点输入，实时地理编码
let originTimer: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originTimer) clearTimeout(originTimer)
  if (!val.trim()) return
  originTimer = setTimeout(async () => {
    const coord = await geocodeAddress(val.trim())
    if (coord) {
      store.params.origin = {
        query: val.trim(),
        lat: coord.lat,
        lon: coord.lon,
        shortName: val.trim(),
        fullName: val.trim(),
      }
    }
  }, 500)
})

// 监听终点输入，实时地理编码
let destTimer: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destTimer) clearTimeout(destTimer)
  if (!val.trim()) return
  destTimer = setTimeout(async () => {
    const coord = await geocodeAddress(val.trim())
    if (coord) {
      store.params.destination = {
        query: val.trim(),
        lat: coord.lat,
        lon: coord.lon,
        shortName: val.trim(),
        fullName: val.trim(),
      }
    }
  }, 500)
})

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (geocodeCache.value.has(address)) {
    return geocodeCache.value.get(address)!
  }
  try {
    const res = await fetch(`https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=c866b4e29221cbc714a4fc78060f23b7`)
    const data = await res.json()
    if (data.status === '1' && data.geocodes?.[0]) {
      const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
      const result = { lat, lon }
      geocodeCache.value.set(address, result)
      return result
    }
  } catch (err) {
    console.error('Geocode failed:', err)
  }
  return null
}

const isFormComplete = computed(() => {
  return originInput.value.trim() && destinationInput.value.trim() && totalDays.value > 0
})

function handleConfirmRoute() {
  if (!isFormComplete.value) return
  store.params.totalDays = totalDays.value
  store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
  store.setMaxDeviation(deviationDistance.value)
}

function handleBackToForm() {
  store.params.origin = null
  store.params.destination = null
  store.setRouteInfo(null)
}

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">行程规划</h2>
        <button
          v-if="isConfirmed"
          class="text-sm text-blue-500 hover:text-blue-700 transition-colors"
          @click="handleBackToForm"
        >
          ← 返回修改
        </button>
      </div>
    </div>

    <!-- 表单区域 -->
    <div v-if="!isConfirmed" class="flex-shrink-0 px-4 py-4 border-b border-gray-100 space-y-4">
      <!-- 起点终点 -->
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <div class="w-0.5 h-8 bg-gray-200"></div>
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div class="flex-1 space-y-2">
          <input
            v-model="originInput"
            placeholder="起点（如：长沙藏珑）"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
          <input
            v-model="destinationInput"
            placeholder="终点（如：昆明）"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <!-- 天数 -->
      <div>
        <label class="text-xs text-gray-400 mb-1 block">旅行天数</label>
        <div class="flex items-center gap-2">
          <input v-model.number="totalDays" type="number" min="1" max="30"
            class="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" />
          <span class="text-sm text-gray-500">天</span>
        </div>
      </div>

      <!-- 每日驾驶时间 -->
      <div>
        <label class="text-xs text-gray-400 mb-1 block">每日驾驶上限</label>
        <div class="flex items-center gap-2">
          <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1" />
          <span class="text-sm font-medium text-blue-600 w-10 text-right">{{ dailyDrivingLimit }}h</span>
        </div>
      </div>

      <!-- 绕路距离 -->
      <div>
        <label class="text-xs text-gray-400 mb-1 block">可接受绕路距离</label>
        <div class="flex items-center gap-2">
          <input v-model.number="deviationDistance" type="range" min="10" max="100" step="10" class="flex-1" />
          <span class="text-sm font-medium text-blue-600 w-12 text-right">{{ deviationDistance }}km</span>
        </div>
      </div>

      <!-- 线路偏好 -->
      <div>
        <label class="text-xs text-gray-400 mb-1 block">线路偏好</label>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="s in ROUTE_STRATEGIES" :key="s.value"
            :class="['px-3 py-2 rounded-lg text-sm text-left transition-colors border',
              selectedStrategy === s.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300']"
            @click="selectedStrategy = s.value">
            {{ s.icon }} {{ s.label }}
          </button>
        </div>
      </div>

      <button :disabled="!isFormComplete"
        class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
        :class="isFormComplete ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
        @click="handleConfirmRoute">
        确认并开始规划
      </button>
    </div>

    <!-- 路线信息（确认后显示） -->
    <div v-if="isConfirmed && store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
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

    <!-- 沿途景点 -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <p class="text-xs text-gray-400">
        {{ store.candidatePois.length > 0 ? `沿途景点 (${store.candidatePois.length})` : '沿途景点' }}
      </p>
    </div>

    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="store.isSearchingPois" class="text-center py-8">
        <div class="inline-flex gap-1">
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
        </div>
        <p class="text-sm text-gray-500 mt-2">搜索中...</p>
      </div>
      <div v-else-if="store.candidatePois.length === 0" class="text-center py-8 text-gray-400 text-sm">
        确认路线后自动搜索沿途景点
      </div>
      <div v-else class="space-y-2">
        <div v-for="poi in store.candidatePois" :key="poi.id"
          :class="['p-3 rounded-lg border cursor-pointer transition-all',
            store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300']"
          @click="store.togglePoiSelection(poi)">
          <div class="flex items-center gap-3">
            <div v-if="poi.photos && poi.photos.length > 0" class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
              <img :src="poi.photos[0].url" class="w-full h-full object-cover" />
            </div>
            <div v-else class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <span class="text-xl">📷</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-800 truncate">{{ poi.name }}</span>
                <span v-if="poi.rating" class="text-xs text-yellow-600">⭐{{ poi.rating }}</span>
              </div>
              <p class="text-xs text-gray-500 truncate">{{ poi.cityname }} {{ poi.adname }}</p>
            </div>
            <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
              store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-500' : 'border-gray-300']">
              <svg v-if="store.selectedPois.some(p => p.id === poi.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 行程卡片 -->
    <div v-if="store.itinerary.length > 0" class="border-t border-gray-200 px-4 py-3 flex-shrink-0">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">每日行程</h3>
      <div class="flex flex-col gap-2">
        <DayCard v-for="day in store.itinerary" :key="day.dayNumber" :day="day"
          :driving-limit="store.params.dailyDrivingLimitHours"
          :is-selected="store.selectedDay === day.dayNumber" @select="handleSelectDay" />
      </div>
    </div>
  </div>
</template>
