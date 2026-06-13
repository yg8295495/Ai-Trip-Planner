<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useTripStore, type PoiInfo } from '@/store/tripStore'
import { geocodeAddress } from '@/services/poiSearch'
import {
  searchDistrict, isDistrictCacheReady, loadDistrictCache, onDistrictCacheChange
} from '@/services/amapDistrict'
import WeatherPanel from '../ItineraryStrip/WeatherPanel.vue'

const store = useTripStore()
const customLocationInput = ref('')
const customSuggestions = ref<{ name: string; adcode: string; center: [number, number]; level: string }[]>([])
const showCustomSuggestions = ref(false)
const districtReady = ref(isDistrictCacheReady())

onMounted(() => {
  if (!districtReady.value) {
    loadDistrictCache().then(() => { districtReady.value = true })
  }
  onDistrictCacheChange((loaded) => { districtReady.value = loaded })
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
    if (districtReady.value) {
      customSuggestions.value = searchDistrict(val.trim(), 8)
    } else {
      customSuggestions.value = []
    }
    showCustomSuggestions.value = true
  }, 200)
})

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
    alert('未找到该地点，请输入更具体的名称（建议先在左侧"起点/终点"中选城市，再具体到区/路）')
  }
}

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
function clearSelectedPois() {
  if (confirm(`确认清空 ${store.selectedPois.length} 个已选景点？`)) {
    store.clearSelectedPois()
  }
}
</script>

<template>
  <!-- 抽屉遮罩 -->
  <Transition name="fade">
    <div
      v-if="store.poiDrawerOpen"
      class="fixed inset-0 bg-black/20 z-30"
      @click="store.setPoiDrawerOpen(false)"
    />
  </Transition>
  <Transition name="slide-right">
    <aside
      v-if="store.poiDrawerOpen"
      class="fixed right-0 top-0 h-full w-[320px] bg-white shadow-2xl z-40 flex flex-col"
    >
      <!-- Header -->
      <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-white">
        <h3 class="text-sm font-semibold text-gray-800">📍 景点管理</h3>
        <button
          class="text-gray-400 hover:text-gray-700 text-lg"
          @click="store.setPoiDrawerOpen(false)"
          title="关闭"
        >×</button>
      </div>

      <!-- 滚动区 -->
      <div class="flex-1 overflow-y-auto" @click="showCustomSuggestions = false">
        <!-- 添加自定义地点 -->
        <div class="px-4 py-3 border-b border-gray-100">
          <label class="text-xs text-gray-500 mb-1.5 block">➕ 添加途经地点（地名/景区）</label>
          <div class="flex gap-2 relative">
            <input
              v-model="customLocationInput"
              placeholder="如：抚仙湖、故宫、张家界"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              @click.stop
              @input.stop
              @focus="customLocationInput && districtReady && (customSuggestions = searchDistrict(customLocationInput, 8), showCustomSuggestions = true)"
              @keydown.enter="handleAddCustomLocation"
            />
            <button
              :disabled="!customLocationInput.trim()"
              class="px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
              @click.stop="handleAddCustomLocation"
            >添加</button>
            <div v-if="showCustomSuggestions" class="absolute left-0 right-12 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
              <div v-if="!districtReady" class="px-3 py-2 text-sm text-blue-500 flex items-center gap-2">
                <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></span>
                加载中...
              </div>
              <div v-else-if="customSuggestions.length === 0" class="px-3 py-2 text-sm text-gray-400">无匹配行政区划</div>
              <div
                v-for="s in customSuggestions"
                :key="s.adcode"
                class="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-0"
                @mousedown.prevent.stop="selectCustomLocation(s)"
              >
                <p class="font-medium">
                  {{ s.name }}
                  <span class="text-xs text-gray-400 ml-1">
                    {{ s.level === 'city' ? '·市' : s.level === 'district' ? '·区/县' : s.level === 'province' ? '·省' : '' }}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-1">提示：选下拉走 0 API，失焦输入完走 1 次地理编码</p>
        </div>

        <!-- 候选 POI 列表 -->
        <div class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-medium text-gray-700">
              🗺️ 沿途候选景点
              <span v-if="store.candidatePois.length > 0" class="text-gray-400 ml-1">({{ store.candidatePois.length }})</span>
            </h4>
            <button
              v-if="store.candidatePois.length > 0"
              class="text-xs text-red-500 hover:text-red-700"
              @click="clearAllPois"
            >清空</button>
          </div>
          <div v-if="store.isSearchingPois" class="text-center py-6">
            <span class="inline-block animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2 align-middle"></span>
            <span class="text-xs text-gray-500">搜索中...</span>
          </div>
          <div v-else-if="store.candidatePois.length === 0" class="text-center py-6 text-xs text-gray-400">
            主右栏点「搜索沿途景点」会出现在这里
          </div>
          <div v-else class="space-y-1.5">
            <div
              v-for="poi in store.candidatePois"
              :key="poi.id"
              :class="['p-2 rounded border cursor-pointer', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white']"
              @click.stop="store.togglePoiSelection(poi)"
            >
              <div class="flex items-center gap-2">
                <div v-if="poi.photos && poi.photos.length > 0" class="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                  <img :src="poi.photos[0].url" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">📷</div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-gray-800 truncate">{{ poi.name }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ poi.cityname }} {{ poi.adname }}</p>
                  <p v-if="poi.rating" class="text-xs text-yellow-600">⭐{{ poi.rating }}</p>
                </div>
                <div :class="['w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center', store.selectedPois.some(p => p.id === poi.id) ? 'border-green-500 bg-green-500' : 'border-gray-300']">
                  <svg v-if="store.selectedPois.some(p => p.id === poi.id)" class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <button class="flex-shrink-0 w-5 h-5 rounded text-gray-300 hover:text-red-500 flex items-center justify-center text-sm" @click="removePoi(poi, $event)" title="删除">×</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 已选 POI 排序 -->
        <div v-if="store.selectedPois.length > 0" class="px-4 py-3 border-t border-gray-100">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-medium text-gray-700">
              ✅ 已选景点（按行程顺序）
              <span class="text-gray-400 ml-1">({{ store.selectedPois.length }})</span>
            </h4>
            <button class="text-xs text-red-500 hover:text-red-700" @click="clearSelectedPois">清空</button>
          </div>
          <div class="space-y-1">
            <div
              v-for="(poi, idx) in store.selectedPois"
              :key="poi.id"
              class="flex items-center gap-1.5 p-1.5 rounded bg-green-50 border border-green-200 text-xs"
            >
              <span class="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-medium flex-shrink-0">{{ idx + 1 }}</span>
              <span class="flex-1 truncate">{{ poi.name }}</span>
              <button :disabled="idx === 0" class="text-gray-400 hover:text-blue-500 disabled:opacity-30" @click.stop="movePoi(poi, 'up', $event)">▲</button>
              <button :disabled="idx === store.selectedPois.length - 1" class="text-gray-400 hover:text-blue-500 disabled:opacity-30" @click.stop="movePoi(poi, 'down', $event)">▼</button>
              <button class="text-gray-400 hover:text-red-500" @click.stop="removePoi(poi, $event)">×</button>
            </div>
          </div>
          <p class="text-xs text-gray-400 mt-2">💡 选中后这些景点会成为行程途经点</p>
        </div>

        <!-- 天气面板 -->
        <div class="border-t border-gray-100 mt-2">
          <WeatherPanel />
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.3s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
