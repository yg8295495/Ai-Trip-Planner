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
  store.setOrigin({
    query: nearest.value.name,
    lat: nearest.value.lat,
    lon: nearest.value.lng,
    shortName: nearest.value.name,
    fullName: nearest.value.address,
  })
  emit('close')
}

function addAsDestination() {
  if (!nearest.value) return
  store.setDestination({
    query: nearest.value.name,
    lat: nearest.value.lat,
    lon: nearest.value.lng,
    shortName: nearest.value.name,
    fullName: nearest.value.address,
  })
  emit('close')
}
</script>

<template>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-80 max-w-[90vw] rounded-xl bg-white shadow-2xl border border-[#E8DCC7] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-[#F5F0E8] border-b border-[#E8DCC7]">
      <div class="min-w-0 flex-1">
        <p class="text-[10px] text-[#8B8578] uppercase tracking-wider">点击位置</p>
        <p class="text-sm font-semibold text-[#2D2A26] truncate">
          {{ nearest?.name || '加载中...' }}
        </p>
      </div>
      <button class="text-[#8B8578] hover:text-[#C66B3D] text-lg ml-2 transition-colors" @click="emit('close')">&times;</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-4 py-6 text-center text-sm text-[#8B8578]">
      <div class="inline-block animate-spin w-4 h-4 border-2 border-[#C66B3D] border-t-transparent rounded-full mr-2"></div>
      查找附近地点...
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-4 py-6 text-center text-sm text-[#C66B3D]">
      {{ error }}
    </div>

    <!-- Content -->
    <div v-else-if="result" class="max-h-96 overflow-y-auto">
      <!-- 主操作 -->
      <div class="px-4 py-3 border-b border-[#E8DCC7] space-y-2">
        <p class="text-[11px] text-[#8B8578]">{{ result.address.formatted }}</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            class="px-3 py-1.5 bg-[#C66B3D] text-white text-[11px] font-medium rounded-lg hover:bg-[#B55E32] transition-colors"
            @click="addNearest"
          >
            + 途经点
          </button>
          <button
            class="px-3 py-1.5 bg-[#606C38] text-white text-[11px] font-medium rounded-lg hover:bg-[#4E582D] transition-colors"
            @click="addAsOrigin"
          >
            设为起点
          </button>
          <button
            class="px-3 py-1.5 border border-[#C66B3D] text-[#C66B3D] text-[11px] font-medium rounded-lg hover:bg-[#FDF2EC] transition-colors"
            @click="addAsDestination"
          >
            设为终点
          </button>
        </div>
      </div>

      <!-- 分类 Tab -->
      <div class="flex border-b border-[#E8DCC7]">
        <button
          v-for="cat in (['scenic', 'hotel', 'food'] as CategoryKey[])"
          :key="cat"
          :class="[
            'flex-1 py-2 text-[11px] font-medium transition-colors',
            activeCategory === cat
              ? 'text-[#C66B3D] border-b-2 border-[#C66B3D]'
              : 'text-[#8B8578] hover:text-[#2D2A26]',
          ]"
          @click="activeCategory = cat"
        >
          {{ cat === 'scenic' ? '景点' : cat === 'hotel' ? '酒店' : '美食' }}
        </button>
      </div>

      <!-- 列表 -->
      <div v-if="filteredPois.length === 0" class="px-4 py-6 text-center text-[11px] text-[#B0A99F]">
        附近暂无{{ activeCategory === 'scenic' ? '景点' : activeCategory === 'hotel' ? '酒店' : '美食' }}
      </div>
      <div v-else>
        <div
          v-for="p in filteredPois"
          :key="p.id"
          class="px-4 py-2.5 flex items-center justify-between hover:bg-[#F5F0E8] transition-colors border-b border-[#E8DCC7] last:border-0"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-[#2D2A26] truncate">{{ p.name }}</p>
            <p class="text-[11px] text-[#8B8578] truncate">{{ p.address || `${p.distance}米` }}</p>
          </div>
          <button
            class="ml-2 flex-shrink-0 w-6 h-6 rounded-full bg-[#F5F0E8] text-[#C66B3D] hover:bg-[#C66B3D] hover:text-white text-sm flex items-center justify-center transition-colors"
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
