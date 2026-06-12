<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import { getCurrentPosition, getInputTips, geocodeAddress } from '@/services/poiSearch'
import DayCard from './DayCard.vue'

const store = useTripStore()

// 表单数据
const originInput = ref(store.params.origin?.query || '')
const destinationInput = ref(store.params.destination?.query || '')
const totalDays = ref(store.params.totalDays || 7)
const dailyDrivingLimit = ref(store.params.dailyDrivingLimitHours || 5)
const deviationDistance = ref(store.maxDeviation || 30)
const selectedStrategy = ref(0)

// 搜索次数限制
const searchCount = ref(0)

// 自定义地点
const customLocationInput = ref('')
const customSuggestions = ref<any[]>([])
const showCustomSuggestions = ref(false)

// 下拉联想
const originSuggestions = ref<any[]>([])
const destSuggestions = ref<any[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)

const isConfirmed = computed(() => {
  return store.params.origin && store.params.destination && store.routeInfo
})

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

// 输入提示
let originTimer: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originTimer) clearTimeout(originTimer)
  if (!val.trim() || val.trim().length < 2) {
    originSuggestions.value = []
    showOriginSuggestions.value = false
    return
  }
  originTimer = setTimeout(async () => {
    originSuggestions.value = await getInputTips(val.trim())
    showOriginSuggestions.value = originSuggestions.value.length > 0
  }, 300)
})

let destTimer: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destTimer) clearTimeout(destTimer)
  if (!val.trim() || val.trim().length < 2) {
    destSuggestions.value = []
    showDestSuggestions.value = false
    return
  }
  destTimer = setTimeout(async () => {
    destSuggestions.value = await getInputTips(val.trim())
    showDestSuggestions.value = destSuggestions.value.length > 0
  }, 300)
})

// 自定义地点搜索
let customTimer: ReturnType<typeof setTimeout> | null = null
watch(customLocationInput, (val) => {
  if (customTimer) clearTimeout(customTimer)
  if (!val.trim() || val.trim().length < 2) {
    customSuggestions.value = []
    showCustomSuggestions.value = false
    return
  }
  customTimer = setTimeout(async () => {
    customSuggestions.value = await getInputTips(val.trim())
    showCustomSuggestions.value = customSuggestions.value.length > 0
  }, 300)
})

function selectOrigin(tip: any) {
  originInput.value = tip.name
  showOriginSuggestions.value = false
  if (tip.location) {
    const [lon, lat] = tip.location.split(',').map(Number)
    store.params.origin = { query: tip.name, lat, lon, shortName: tip.name, fullName: tip.name || tip.address }
  }
}

function selectDest(tip: any) {
  destinationInput.value = tip.name
  showDestSuggestions.value = false
  if (tip.location) {
    const [lon, lat] = tip.location.split(',').map(Number)
    store.params.destination = { query: tip.name, lat, lon, shortName: tip.name, fullName: tip.name || tip.address }
  }
}

function selectCustomLocation(tip: any) {
  customLocationInput.value = ''
  showCustomSuggestions.value = false
  if (tip.location) {
    const [lon, lat] = tip.location.split(',').map(Number)
    const newPoi = {
      id: `custom_${Date.now()}`,
      name: tip.name,
      type: tip.type || '',
      typecode: '',
      address: tip.address || '',
      location: tip.location,
      cityname: tip.cityname || '',
      adname: tip.adname || '',
      rating: '',
      cost: '',
      photos: [],
      tel: '',
      tag: '',
    }
    store.candidatePois.unshift(newPoi)
    store.togglePoiSelection(newPoi)
  }
}

async function handleAddCustomLocation() {
  if (!customLocationInput.value.trim()) return
  const coord = await geocodeAddress(customLocationInput.value.trim())
  if (coord) {
    const newPoi = {
      id: `custom_${Date.now()}`,
      name: customLocationInput.value.trim(),
      type: '自定义',
      typecode: '',
      address: '',
      location: `${coord.lon},${coord.lat}`,
      cityname: '',
      adname: '',
      rating: '',
      cost: '',
      photos: [],
      tel: '',
      tag: '',
    }
    store.candidatePois.unshift(newPoi)
    store.togglePoiSelection(newPoi)
    customLocationInput.value = ''
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
  showCustomSuggestions.value = false
}

// 我的位置
async function useMyLocation() {
  const pos = await getCurrentPosition()
  if (pos) {
    originInput.value = pos.city || '当前位置'
    store.params.origin = { query: pos.city || '当前位置', lat: pos.lat, lon: pos.lon, shortName: pos.city, fullName: pos.city }
  }
}

// 互换起终点
function swapOriginDest() {
  const temp = originInput.value
  originInput.value = destinationInput.value
  destinationInput.value = temp
  const tempParams = store.params.origin
  store.params.origin = store.params.destination
  store.params.destination = tempParams
}

const isFormComplete = computed(() => {
  return originInput.value.trim() && destinationInput.value.trim() && totalDays.value > 0
})

function handleConfirmRoute() {
  if (!isFormComplete.value) return
  store.params.totalDays = totalDays.value
  store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
  store.setMaxDeviation(deviationDistance.value)
  searchCount.value = 0
  closeSuggestions()
}

function handleSearch() {
  if (searchCount.value >= 3) return
  searchCount.value++
  store.searchPoisByRoute()
}

function handleBackToForm() {
  store.params.origin = null
  store.params.destination = null
  store.setRouteInfo(null)
  store.setCandidatePois([])
  searchCount.value = 0
}
  originTimer = setTimeout(async () => {
    originSuggestions.value = await getInputTips(val.trim())
    showOriginSuggestions.value = originSuggestions.value.length > 0
  }, 300)
})

let destTimer: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destTimer) clearTimeout(destTimer)
  if (!val.trim() || val.trim().length < 2) {
    destSuggestions.value = []
    showDestSuggestions.value = false
    return
  }
  destTimer = setTimeout(async () => {
    destSuggestions.value = await getInputTips(val.trim())
    showDestSuggestions.value = destSuggestions.value.length > 0
  }, 300)
})

function selectOrigin(tip: any) {
  originInput.value = tip.name
  showOriginSuggestions.value = false
  if (tip.location) {
    const [lon, lat] = tip.location.split(',').map(Number)
    store.params.origin = { query: tip.name, lat, lon, shortName: tip.name, fullName: tip.name || tip.address }
  }
}

function selectDest(tip: any) {
  destinationInput.value = tip.name
  showDestSuggestions.value = false
  if (tip.location) {
    const [lon, lat] = tip.location.split(',').map(Number)
    store.params.destination = { query: tip.name, lat, lon, shortName: tip.name, fullName: tip.name || tip.address }
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
}

// 我的位置
async function useMyLocation() {
  const pos = await getCurrentPosition()
  if (pos) {
    originInput.value = pos.city || '当前位置'
    store.params.origin = { query: pos.city || '当前位置', lat: pos.lat, lon: pos.lon, shortName: pos.city, fullName: pos.city }
  }
}

// 互换起终点
function swapOriginDest() {
  const temp = originInput.value
  originInput.value = destinationInput.value
  destinationInput.value = temp

  const tempParams = store.params.origin
  store.params.origin = store.params.destination
  store.params.destination = tempParams
}

const isFormComplete = computed(() => {
  return originInput.value.trim() && destinationInput.value.trim() && totalDays.value > 0
})

function handleConfirmRoute() {
  if (!isFormComplete.value) return
  store.params.totalDays = totalDays.value
  store.params.dailyDrivingLimitHours = dailyDrivingLimit.value
  store.setMaxDeviation(deviationDistance.value)
  closeSuggestions()
}

function handleBackToForm() {
  store.params.origin = null
  store.params.destination = null
  store.setRouteInfo(null)
  store.setCandidatePois([])
}
</script>

<template>
  <div class="flex flex-col h-full" @click="closeSuggestions">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">行程规划</h2>
        <button v-if="isConfirmed"
          class="text-sm text-blue-500 hover:text-blue-700 transition-colors"
          @click.stop="handleBackToForm">
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
        <div class="flex-1 space-y-2 relative">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input v-model="originInput" placeholder="起点（如：长沙藏珑）"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none pr-8"
                @click.stop @input.stop />
              <button class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-blue-500"
                @click.stop="useMyLocation" title="定位当前位置">
                📍
              </button>
              <div v-if="showOriginSuggestions && originSuggestions.length > 0"
                class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-for="tip in originSuggestions" :key="tip.id"
                  class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  @click.stop="selectOrigin(tip)">
                  <p class="font-medium">{{ tip.name }}</p>
                  <p class="text-xs text-gray-400">{{ tip.address }}</p>
                </div>
              </div>
            </div>
            <button class="px-2 py-2 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg"
              @click.stop="swapOriginDest" title="互换起终点">
              ⇅
            </button>
            <div class="flex-1 relative">
              <input v-model="destinationInput" placeholder="终点（如：昆明）"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                @click.stop @input.stop />
              <div v-if="showDestSuggestions && destSuggestions.length > 0"
                class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-for="tip in destSuggestions" :key="tip.id"
                  class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  @click.stop="selectDest(tip)">
                  <p class="font-medium">{{ tip.name }}</p>
                  <p class="text-xs text-gray-400">{{ tip.address }}</p>
                </div>
              </div>
            </div>
          </div>
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

      <!-- 每日驾驶时间 + 绕路距离 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gray-400 mb-1 block">每日驾驶上限</label>
          <div class="flex items-center gap-2">
            <input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1" />
            <span class="text-sm font-medium text-blue-600 w-8 text-right">{{ dailyDrivingLimit }}h</span>
          </div>
        </div>
      </div>

      <!-- 线路偏好 -->
      <div>
        <label class="text-xs text-gray-400 mb-1 block">线路偏好</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button v-for="s in ROUTE_STRATEGIES" :key="s.value"
            :class="['px-2 py-1.5 rounded text-xs transition-colors border',
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

      <!-- 搜索次数限制 -->
      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-gray-400">搜索次数：{{ 3 - searchCount }}/3</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">绕路 {{ deviationDistance }}km</span>
        </div>
      </div>
    </div>

    <!-- 自定义地点添加 -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <div class="flex gap-2">
        <input v-model="customLocationInput" placeholder="添加自定义地点..."
          class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          @keydown.enter="handleAddCustomLocation" />
        <button :disabled="!customLocationInput.trim()"
          class="px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
          @click="handleAddCustomLocation">
          添加
        </button>
      </div>
      <div v-if="showCustomSuggestions && customSuggestions.length > 0"
        class="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
        <div v-for="tip in customSuggestions" :key="tip.id"
          class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0"
          @click="selectCustomLocation(tip)">
          <p class="font-medium">{{ tip.name }}</p>
          <p class="text-xs text-gray-400">{{ tip.address }}</p>
        </div>
      </div>
    </div>

    <!-- 景点列表 -->
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
        点击下方按钮搜索沿途景点，或在上方添加自定义地点
      </div>
      <div v-else class="space-y-2">
        <p class="text-xs text-gray-400 mb-2">找到 {{ store.candidatePois.length }} 个景点</p>
        <div v-for="poi in store.candidatePois" :key="poi.id"
          :class="['p-3 rounded-lg border cursor-pointer transition-all',
            store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300']"
          @click.stop="store.togglePoiSelection(poi)">
          <div class="flex items-center gap-3">
            <div v-if="poi.photos && poi.photos.length > 0" class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
              <img :src="poi.photos[0].url" class="w-full h-full object-cover" />
            </div>
            <div v-else class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">📷</div>
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

    <!-- 搜索按钮 -->
    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      <button :disabled="store.isSearchingPois || searchCount >= 3"
        class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        :class="searchCount >= 3 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'"
        @click.stop="handleSearch">
        {{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '搜索次数已用完' : '搜索沿途景点' }}
      </button>
      <p v-if="searchCount >= 3" class="text-xs text-red-500 mt-1 text-center">
        搜索次数已用完，重新搜索请返回修改路线
      </p>
    </div>
  </div>
</template>
