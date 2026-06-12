<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTripStore, type PoiInfo } from '@/store/tripStore'
import { ROUTE_STRATEGIES } from '@/composables/useMap'
import { geocodeAddress } from '@/services/poiSearch'
import { loadDistrictCache, searchDistrict } from '@/services/amapDistrict'
import { getCurrentPosition as getGeoPosition } from '@/services/amapGeolocation'
import WeatherPanel from './WeatherPanel.vue'

const store = useTripStore()
const originInput = ref('')
const destinationInput = ref('')
const totalDays = ref(7)
const dailyDrivingLimit = ref(5)
const deviationDistance = ref(30)
const selectedStrategy = ref(0)
const searchCount = ref(0)
const customLocationInput = ref('')

// 客户端地名匹配结果
const originSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const destSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const customSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const showOriginSuggestions = ref(false)
const showDestSuggestions = ref(false)
const showCustomSuggestions = ref(false)

// 验证状态（✓ 已识别 / ⚠️ 未找到）
const originValid = ref<'idle' | 'valid' | 'invalid'>('idle')
const destValid = ref<'idle' | 'valid' | 'invalid'>('idle')

const isConfirmed = computed(() => store.params.origin && store.params.destination && store.routeInfo)

const isFormComplete = computed(() =>
  originInput.value.trim() &&
  destinationInput.value.trim() &&
  totalDays.value > 0 &&
  originValid.value === 'valid' &&
  destValid.value === 'valid'
)

// 启动时预加载全国行政区（仅 1 次 API 调用）
onMounted(async () => {
  try {
    await loadDistrictCache()
  } catch (e) {
    console.warn('District cache load failed:', e)
  }
})

// 监听输入 → 客户端匹配
let originDebounce: ReturnType<typeof setTimeout> | null = null
watch(originInput, (val) => {
  if (originDebounce) clearTimeout(originDebounce)
  originValid.value = 'idle'
  if (!val.trim()) {
    originSuggestions.value = []
    showOriginSuggestions.value = false
    return
  }
  originDebounce = setTimeout(() => {
    originSuggestions.value = searchDistrict(val.trim(), 8)
    showOriginSuggestions.value = originSuggestions.value.length > 0
  }, 200)
})

let destDebounce: ReturnType<typeof setTimeout> | null = null
watch(destinationInput, (val) => {
  if (destDebounce) clearTimeout(destDebounce)
  destValid.value = 'idle'
  if (!val.trim()) {
    destSuggestions.value = []
    showDestSuggestions.value = false
    return
  }
  destDebounce = setTimeout(() => {
    destSuggestions.value = searchDistrict(val.trim(), 8)
    showDestSuggestions.value = destSuggestions.value.length > 0
  }, 200)
})

let customDebounce: ReturnType<typeof setTimeout> | null = null
watch(customLocationInput, (val) => {
  if (customDebounce) clearTimeout(customDebounce)
  if (!val.trim()) {
    customSuggestions.value = []
    showCustomSuggestions.value = false
    return
  }
  customDebounce = setTimeout(() => {
    customSuggestions.value = searchDistrict(val.trim(), 8)
    showCustomSuggestions.value = customSuggestions.value.length > 0
  }, 200)
})

// 选中下拉项
function selectOrigin(item: { name: string; adcode: string; center: [number, number]; level: string }) {
  originInput.value = item.name
  showOriginSuggestions.value = false
  originValid.value = 'valid'
  store.params.origin = {
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.name,
  }
}
function selectDest(item: { name: string; adcode: string; center: [number, number]; level: string }) {
  destinationInput.value = item.name
  showDestSuggestions.value = false
  destValid.value = 'valid'
  store.params.destination = {
    query: item.name,
    lat: item.center[1],
    lon: item.center[0],
    shortName: item.name,
    fullName: item.name,
  }
}
function selectCustomLocation(item: { name: string; adcode: string; center: [number, number] }) {
  const p: PoiInfo = {
    id: `custom_${Date.now()}`,
    name: item.name,
    type: '自定义',
    typecode: '',
    address: '',
    location: `${item.center[0]},${item.center[1]}`,
    cityname: '',
    adname: '',
    rating: '',
    cost: '',
    photos: [],
    tel: '',
    tag: '',
  }
  store.addCandidatePoi(p)
  store.togglePoiSelection(p)
  customLocationInput.value = ''
  showCustomSuggestions.value = false
}

// 失焦时 geocode 兜底验证
async function validateOrigin() {
  if (!originInput.value.trim() || originValid.value === 'valid') return
  showOriginSuggestions.value = false
  const r = await geocodeAddress(originInput.value.trim())
  if (r) {
    originValid.value = 'valid'
    if (!store.params.origin) {
      store.params.origin = {
        query: originInput.value.trim(),
        lat: r.lat,
        lon: r.lon,
        shortName: originInput.value.trim(),
        fullName: originInput.value.trim(),
      }
    }
  } else {
    originValid.value = 'invalid'
  }
}
async function validateDest() {
  if (!destinationInput.value.trim() || destValid.value === 'valid') return
  showDestSuggestions.value = false
  const r = await geocodeAddress(destinationInput.value.trim())
  if (r) {
    destValid.value = 'valid'
    if (!store.params.destination) {
      store.params.destination = {
        query: destinationInput.value.trim(),
        lat: r.lat,
        lon: r.lon,
        shortName: destinationInput.value.trim(),
        fullName: destinationInput.value.trim(),
      }
    }
  } else {
    destValid.value = 'invalid'
  }
}

// 添加自定义地点（点"添加"按钮 - 用 geocode）
async function handleAddCustomLocation() {
  if (!customLocationInput.value.trim()) return
  const coord = await geocodeAddress(customLocationInput.value.trim())
  if (coord) {
    const p: PoiInfo = {
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
    store.addCandidatePoi(p)
    store.togglePoiSelection(p)
    customLocationInput.value = ''
  } else {
    alert('未找到该地点，请输入更具体的名称')
  }
}

function closeSuggestions() {
  showOriginSuggestions.value = false
  showDestSuggestions.value = false
  showCustomSuggestions.value = false
}

// 📍 定位 - AMap.Geolocation 插件
const isLocating = ref(false)
async function useMyLocation() {
  if (isLocating.value) return
  isLocating.value = true
  try {
    const pos = await getGeoPosition()
    originInput.value = pos.city || pos.district || '当前位置'
    originValid.value = 'valid'
    store.params.origin = {
      query: originInput.value,
      lat: pos.lat,
      lon: pos.lon,
      shortName: pos.city,
      fullName: pos.address,
    }
  } catch (e: any) {
    // 失败提示用户手动输入
    alert(`定位失败：${e?.message || '请手动输入起点'}\n（手机请开启定位权限，电脑可能因无 GPS 精度较低）`)
  } finally {
    isLocating.value = false
  }
}

function swapOriginDest() {
  const t = originInput.value
  originInput.value = destinationInput.value
  destinationInput.value = t
  const tp = store.params.origin
  store.params.origin = store.params.destination
  store.params.destination = tp
  const tv = originValid.value
  originValid.value = destValid.value
  destValid.value = tv
}

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
  store.locations = []
  searchCount.value = 0
  originInput.value = ''
  destinationInput.value = ''
  originValid.value = 'idle'
  destValid.value = 'idle'
}

// 列表维护
function removePoi(poi: PoiInfo, e: Event) {
  e.stopPropagation()
  store.removeCandidatePoi(poi.id)
}
function movePoi(poi: PoiInfo, dir: 'up' | 'down', e: Event) {
  e.stopPropagation()
  store.moveSelectedPoi(poi.id, dir)
}
function clearAllPois() {
  if (confirm(`确认清空所有 ${store.candidatePois.length} 个景点？`)) {
    store.clearAllCandidatePois()
  }
}
</script>

<template>
  <div class="flex flex-col h-full" @click="closeSuggestions">
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">行程规划</h2>
        <button v-if="isConfirmed" class="text-sm text-blue-500 hover:text-blue-700" @click.stop="handleBackToForm">← 返回修改</button>
      </div>
    </div>

    <div v-if="!isConfirmed" class="flex-shrink-0 px-4 py-4 border-b border-gray-100 space-y-4">
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-center"><div class="w-3 h-3 rounded-full bg-green-500"></div><div class="w-0.5 h-8 bg-gray-200"></div><div class="w-3 h-3 rounded-full bg-red-500"></div></div>
        <div class="flex-1 space-y-2 relative">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                v-model="originInput"
                placeholder="起点（城市/区县）"
                class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none pr-16"
                :class="originValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                @click.stop
                @input.stop
                @blur="validateOrigin"
              />
              <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span v-if="originValid === 'valid'" class="text-green-500 text-xs">✓</span>
                <span v-else-if="originValid === 'invalid'" class="text-red-500 text-xs">⚠</span>
                <button
                  class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-50"
                  :disabled="isLocating"
                  @click.stop="useMyLocation"
                  :title="isLocating ? '定位中...' : '使用当前位置'"
                >{{ isLocating ? '⌛' : '📍' }}</button>
              </div>
              <div v-if="showOriginSuggestions && originSuggestions.length > 0" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-for="s in originSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectOrigin(s)">
                  <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}</span></p>
                </div>
              </div>
            </div>
            <button class="px-2 py-2 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg" @click.stop="swapOriginDest" title="互换">⇅</button>
            <div class="flex-1 relative">
              <input
                v-model="destinationInput"
                placeholder="终点（城市/区县）"
                class="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none"
                :class="destValid === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'"
                @click.stop
                @input.stop
                @blur="validateDest"
              />
              <span v-if="destValid === 'valid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
              <span v-else-if="destValid === 'invalid'" class="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 text-xs">⚠</span>
              <div v-if="showDestSuggestions && destSuggestions.length > 0" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                <div v-for="s in destSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectDest(s)">
                  <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : s.level === 'province' ? '省' : '' }}</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="text-xs text-gray-400 mb-1 block">旅行天数</label><div class="flex items-center gap-2"><input v-model.number="totalDays" type="number" min="1" max="30" class="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" /><span class="text-sm text-gray-500">天</span></div></div>
        <div><label class="text-xs text-gray-400 mb-1 block">每日驾驶上限</label><div class="flex items-center gap-2"><input v-model.number="dailyDrivingLimit" type="range" min="2" max="10" class="flex-1" /><span class="text-sm font-medium text-blue-600 w-8 text-right">{{ dailyDrivingLimit }}h</span></div></div>
      </div>
      <div><label class="text-xs text-gray-400 mb-1 block">线路偏好</label><div class="grid grid-cols-4 gap-1.5"><button v-for="s in ROUTE_STRATEGIES" :key="s.value" :class="['px-2 py-1.5 rounded text-xs border', selectedStrategy === s.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600']" @click="selectedStrategy = s.value">{{ s.icon }} {{ s.label }}</button></div></div>
      <button :disabled="!isFormComplete" class="w-full py-2.5 rounded-lg text-sm font-medium" :class="isFormComplete ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400'" @click="handleConfirmRoute">确认并开始规划</button>
    </div>

    <div v-if="isConfirmed && store.routeInfo" class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div><p class="text-lg font-semibold text-blue-600">{{ (store.routeInfo.distance / 1000).toFixed(0) }}</p><p class="text-xs text-gray-400">公里</p></div>
        <div><p class="text-lg font-semibold text-blue-600">{{ (store.routeInfo.duration / 3600).toFixed(1) }}</p><p class="text-xs text-gray-400">小时</p></div>
        <div><p class="text-lg font-semibold text-blue-600">{{ store.routeInfo.cities.length }}</p><p class="text-xs text-gray-400">城市</p></div>
      </div>
      <div class="mt-2 flex items-center justify-between"><span class="text-xs text-gray-400">搜索次数：{{ 3 - searchCount }}/3</span></div>
    </div>

    <WeatherPanel v-if="isConfirmed" />

    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <div class="flex gap-2">
        <input v-model="customLocationInput" placeholder="添加自定义地点..." class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" @keydown.enter="handleAddCustomLocation" @click.stop />
        <button :disabled="!customLocationInput.trim()" class="px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50" @click.stop="handleAddCustomLocation">添加</button>
      </div>
      <div v-if="showCustomSuggestions && customSuggestions.length > 0" class="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
        <div v-for="s in customSuggestions" :key="s.adcode" class="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0" @mousedown.prevent.stop="selectCustomLocation(s)">
          <p class="font-medium">{{ s.name }} <span class="text-xs text-gray-400">{{ s.level === 'city' ? '市' : s.level === 'district' ? '区/县' : '' }}</span></p>
        </div>
      </div>
    </div>

    <div v-if="isConfirmed" class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="store.isSearchingPois" class="text-center py-8"><p class="text-sm text-gray-500">搜索中...</p></div>
      <div v-else-if="store.candidatePois.length === 0" class="text-center py-8 text-gray-400 text-sm">点击下方按钮搜索沿途景点</div>
      <div v-else>
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs text-gray-400">找到 {{ store.candidatePois.length }} 个景点</p>
          <button class="text-xs text-red-500 hover:text-red-700" @click="clearAllPois">清空</button>
        </div>
        <div class="space-y-2">
          <div
            v-for="(poi, idx) in store.candidatePois"
            :key="poi.id"
            :class="['p-3 rounded-lg border cursor-pointer', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white']"
            @click.stop="store.togglePoiSelection(poi)"
          >
            <div class="flex items-center gap-3">
              <div v-if="poi.photos && poi.photos.length > 0" class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                <img :src="poi.photos[0].url" class="w-full h-full object-cover" />
              </div>
              <div v-else class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">📷</div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-gray-800 truncate">{{ poi.name }}</span>
                <span v-if="poi.rating" class="text-xs text-yellow-600 ml-1">⭐{{ poi.rating }}</span>
                <p class="text-xs text-gray-500 truncate">{{ poi.cityname }} {{ poi.adname }}</p>
                <p v-if="poi.tag" class="text-xs text-blue-500 truncate">{{ poi.tag }}</p>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-500' : 'border-gray-300']">
                  <svg v-if="store.selectedPois.some(p => p.id === poi.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <!-- 排序按钮（仅已选中的显示） -->
                <div v-if="store.selectedPois.some(p => p.id === poi.id)" class="flex flex-col gap-0.5">
                  <button
                    :disabled="idx === 0"
                    class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-30"
                    @click="movePoi(poi, 'up', $event)"
                    title="上移"
                  >▲</button>
                  <button
                    :disabled="idx === store.candidatePois.length - 1"
                    class="text-xs text-gray-400 hover:text-blue-500 disabled:opacity-30"
                    @click="movePoi(poi, 'down', $event)"
                    title="下移"
                  >▼</button>
                </div>
              </div>
              <!-- 删除按钮 -->
              <button
                class="flex-shrink-0 w-6 h-6 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-base"
                @click="removePoi(poi, $event)"
                title="删除"
              >×</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isConfirmed" class="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      <button :disabled="store.isSearchingPois || searchCount >= 3" class="w-full py-2.5 rounded-lg text-sm font-medium" :class="searchCount >= 3 ? 'bg-gray-300 text-gray-500' : 'bg-blue-500 text-white hover:bg-blue-600'" @click.stop="handleSearch">{{ store.isSearchingPois ? '搜索中...' : searchCount >= 3 ? '搜索次数已用完' : '搜索沿途景点' }}</button>
      <p v-if="searchCount >= 3" class="text-xs text-red-500 mt-1 text-center">搜索次数已用完，重新搜索请返回修改路线</p>
    </div>
  </div>
</template>
