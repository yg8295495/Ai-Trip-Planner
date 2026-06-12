<script setup lang="ts">
/**
 * 地图点击浮层
 * 流程：map.on('click') -> 调 regeo -> 弹此浮层
 *  - 头部：点击点的最近 POI（默认"添加到这里"）
 *  - 分类：景点 / 酒店 / 美食 列表，每条 + 加入按钮
 */
import { ref, computed, watch } from 'vue'
import { useTripStore, type PoiInfo } from '@/store/tripStore'
import { regeo, type RegeoResult, type CategoryKey, type RegeoPoi } from '@/services/amapRegeo'

const props = defineProps<{
  lng: number
  lat: number
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTripStore()
const loading = ref(false)
const result = ref<RegeoResult | null>(null)
const error = ref<string | null>(null)
const activeCategory = ref<CategoryKey>('scenic')

// 默认"添加这里"的目标（最近 POI 的 location 转 PoiInfo）
const nearest = computed<{ name: string; address: string; adcode: string; lng: number; lat: number } | null>(() => {
  if (!result.value) return null
  // AOI 优先
  const aoi = result.value.aois.sort((a, b) => a.distance - b.distance)[0]
  if (aoi) {
    const [lng, lat] = aoi.location.split(',').map(Number)
    return { name: aoi.name, address: result.value.address.formatted, adcode: aoi.adcode, lng, lat }
  }
  const poi = result.value.pois.sort((a, b) => a.distance - b.distance)[0]
  if (poi) {
    const [lng, lat] = poi.location.split(',').map(Number)
    return { name: poi.name, address: poi.address, adcode: result.value.address.adcode, lng, lat }
  }
  // 没有任何 POI，用 regeo 的 address
  return {
    name: result.value.address.township || result.value.address.district || '此地',
    address: result.value.address.formatted,
    adcode: result.value.address.adcode,
    lng: props.lng,
    lat: props.lat,
  }
})

// 分类下的 POI
const filteredPois = computed<RegeoPoi[]>(() => {
  if (!result.value) return []
  return result.value.pois.filter(p => p.category === activeCategory.value)
})

watch(
  () => [props.lng, props.lat] as const,
  async ([lng, lat]) => {
    if (lng == null || lat == null) return
    loading.value = true
    error.value = null
    result.value = null
    try {
      const r = await regeo(lng, lat, { radius: 1000, categories: ['scenic', 'hotel', 'food'], limit: 8 })
      if (!r) {
        error.value = '逆地理编码失败'
      } else {
        result.value = r
      }
    } catch (e: any) {
      error.value = e?.message || '查询失败'
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// 把 PoiInfo 加到 candidatePois
function buildPoiFromNearest(): PoiInfo {
  const n = nearest.value!
  return {
    id: `click_${Date.now()}`,
    name: n.name,
    type: result.value?.aois.length ? 'AOI' : 'POI',
    typecode: '',
    address: n.address,
    location: `${n.lng},${n.lat}`,
    cityname: result.value?.address.city || '',
    adname: result.value?.address.district || '',
    rating: '',
    cost: '',
    photos: [],
    tel: '',
    tag: '点击地图添加',
  }
}

function buildPoiFromPoi(p: RegeoPoi): PoiInfo {
  return {
    id: p.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: p.name,
    type: p.type,
    typecode: '',
    address: p.address,
    location: p.location,
    cityname: result.value?.address.city || '',
    adname: result.value?.address.district || '',
    rating: '',
    cost: '',
    photos: [],
    tel: '',
    tag: p.category || '',
  }
}

function addNearest() {
  const poi = buildPoiFromNearest()
  store.addCandidatePoi(poi)
  store.togglePoiSelection(poi)
  emit('close')
}

function addPoi(p: RegeoPoi) {
  const poi = buildPoiFromPoi(p)
  store.addCandidatePoi(poi)
  store.togglePoiSelection(poi)
}

function addAsOrigin() {
  if (!nearest.value) return
  store.params.origin = {
    query: nearest.value.name,
    lat: nearest.value.lat,
    lon: nearest.value.lng,
    shortName: nearest.value.name,
    fullName: nearest.value.address,
  }
  emit('close')
}

function addAsDestination() {
  if (!nearest.value) return
  store.params.destination = {
    query: nearest.value.name,
    lat: nearest.value.lat,
    lon: nearest.value.lng,
    shortName: nearest.value.name,
    fullName: nearest.value.address,
  }
  emit('close')
}
</script>

<template>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-80 max-w-[90vw] rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
      <div>
        <p class="text-xs text-gray-500">📍 点击位置</p>
        <p class="text-sm font-semibold text-gray-800 truncate max-w-[220px]">
          {{ nearest?.name || '加载中...' }}
        </p>
      </div>
      <button class="text-gray-400 hover:text-gray-600 text-lg" @click="emit('close')">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 py-6 text-center text-sm text-gray-500">
      <div class="inline-block animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
      查找附近地点...
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-4 py-6 text-center text-sm text-red-500">
      {{ error }}
    </div>

    <!-- Content -->
    <div v-else-if="result" class="max-h-96 overflow-y-auto">
      <!-- 主操作：添加这里 / 设为起点 / 设为终点 -->
      <div class="px-4 py-3 border-b border-gray-100 space-y-2">
        <p class="text-xs text-gray-500">📍 {{ result.address.formatted }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600"
            @click="addNearest"
          >
            + 添加到这里
          </button>
          <button
            class="px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600"
            @click="addAsOrigin"
          >
            设为起点
          </button>
          <button
            class="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600"
            @click="addAsDestination"
          >
            设为终点
          </button>
        </div>
      </div>

      <!-- 分类 Tab -->
      <div class="flex border-b border-gray-100">
        <button
          v-for="cat in (['scenic', 'hotel', 'food'] as CategoryKey[])"
          :key="cat"
          :class="[
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeCategory === cat
              ? 'text-blue-600 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700',
          ]"
          @click="activeCategory = cat"
        >
          {{ cat === 'scenic' ? '🏞️ 景点' : cat === 'hotel' ? '🏨 酒店' : '🍜 美食' }}
        </button>
      </div>

      <!-- 列表 -->
      <div v-if="filteredPois.length === 0" class="px-4 py-6 text-center text-xs text-gray-400">
        附近暂无{{ activeCategory === 'scenic' ? '景点' : activeCategory === 'hotel' ? '酒店' : '美食' }}
      </div>
      <div v-else class="divide-y divide-gray-50">
        <div
          v-for="p in filteredPois"
          :key="p.id"
          class="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">{{ p.name }}</p>
            <p class="text-xs text-gray-400 truncate">{{ p.address || `${p.distance}米` }}</p>
          </div>
          <button
            class="ml-2 flex-shrink-0 text-blue-500 hover:text-blue-700 text-sm"
            title="添加到行程"
            @click="addPoi(p)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
