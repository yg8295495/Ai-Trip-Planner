import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CtripPOI, OsmPOI, BoundsRect } from '@/types/poi'

export const usePoiStore = defineStore('poi', () => {
  // 状态变量
  const candidatePois = ref<CtripPOI[]>([])  // 携程核心候选池
  const osmPois = ref<OsmPOI[]>([])          // OSM 长尾发现池
  const selectedCategory = ref<string>('')    // 当前选中的13类标签
  const isSelectedOnly = ref<boolean>(false)  // 仅看已选模式
  const isLoading = ref<boolean>(false)
  const lastBounds = ref<BoundsRect | null>(null)
  const searchRadius = ref<number>(20)

  // 前端筛选：按分类过滤候选 POI
  const filteredPois = computed(() => {
    if (!selectedCategory.value || selectedCategory.value === '全部') return candidatePois.value
    return candidatePois.value.filter(p => p.category === selectedCategory.value)
  })

  // 携程13类分类标签
  const CATEGORIES = [
    "历史建筑", "自然山水", "主题乐园&游乐场", "亲子同乐",
    "博物馆&展馆", "地标观景", "城市漫步", "夜游观景",
    "赏花胜地", "遛娃宝藏地", "亲近动物", "园林花园", "缆车索道"
  ]

  /**
   * 场景 1 & 2：调用后端空间检索接口 (POST /api/pois/search)
   */
  let searchCallCount = 0
  async function searchCtripPois(boundsList: BoundsRect[], isRouteMode: boolean = false) {
    searchCallCount++
    isLoading.value = true
    lastBounds.value = boundsList[0] || null
    
    // 安全超时：10秒后强制关闭loading，防止死锁
    const safetyTimeout = setTimeout(() => {
      if (isLoading.value) isLoading.value = false
    }, 10000)

    try {
      const controller = new AbortController()
      const fetchTimeout = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch('/api/pois/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bounds_list: boundsList,
          category: selectedCategory.value || null,
          is_route_mode: isRouteMode,
          limit: 40
        }),
        signal: controller.signal
      })
      clearTimeout(fetchTimeout)
      
      const data = await response.json()
      candidatePois.value = data.pois || []
    } catch (error) {
      console.error('[poiStore] searchCtripPois failed:', error)
    } finally {
      clearTimeout(safetyTimeout)
      isLoading.value = false
    }
  }

  /**
   * 场景 3：OSM 长尾发现 (GET /api/pois/osm-discover)
   */
  async function discoverOsmPois(bounds: BoundsRect) {
    try {
      const params = new URLSearchParams({
        min_lat: bounds.min_lat.toString(),
        max_lat: bounds.max_lat.toString(),
        min_lng: bounds.min_lng.toString(),
        max_lng: bounds.max_lng.toString(),
        limit: '15'
      })
      const response = await fetch(`/api/pois/osm-discover?${params}`)
      const data = await response.json()
      osmPois.value = data.osm_pois || []
    } catch (error) {
      console.error('[poiStore] Failed to discover OSM long-tail POIs:', error)
    }
  }

  function setSelectedCategory(category: string) {
    selectedCategory.value = category
  }

  function clearSelectedCategory() {
    selectedCategory.value = ''
  }

  function toggleSelectedOnly() {
    isSelectedOnly.value = !isSelectedOnly.value
  }

  function clearOsmPois() {
    osmPois.value = []
  }

  function clearAll() {
    candidatePois.value = []
    osmPois.value = []
    selectedCategory.value = ''
    isSelectedOnly.value = false
  }

  return {
    candidatePois,
    filteredPois,
    osmPois,
    selectedCategory,
    isSelectedOnly,
    isLoading,
    lastBounds,
    searchRadius,
    CATEGORIES,
    searchCtripPois,
    discoverOsmPois,
    setSelectedCategory,
    clearSelectedCategory,
    toggleSelectedOnly,
    clearOsmPois,
    clearAll
  }
})
