import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Waypoint, CtripPOI } from '@/types/poi'
import type { RouteInfo } from '@/types'
import { computeRoute, type RouteResult } from '@/services/routeScheduler'
import { usePoiStore } from './poiStore'

export const useRouteStore = defineStore('route', () => {
  // 核心状态：一维扁平珍珠项链
  const waypoints = ref<Waypoint[]>([])
  const globalStrategy = ref<number>(2) // 2=高速, 13=不走高速, 10=智能

  // 微观雷达控制信号
  const activeDayIndex = ref<number | null>(null)
  const activeWaypointId = ref<string | null>(null)

  // 高德路线数据
  const routeInfo = ref<RouteInfo | null>(null)
  const isComputingRoute = ref(false)
  const availableRoutes = ref<RouteResult[]>([])

  // 动态衍生：根据 isOvernight 属性自动进行分日切片
  const routeByDays = computed(() => {
    const days: Waypoint[][] = [[]]
    let currentDayIndex = 0

    waypoints.value.forEach((wp) => {
      days[currentDayIndex].push(wp)
      if (wp.isOvernight) {
        currentDayIndex++
        days[currentDayIndex] = [wp]
      }
    })
    return days.filter(d => d.length > 0)
  })

  // 当前行程单是否为空
  const isEmpty = computed(() => waypoints.value.length === 0)

  // 行程摘要
  const tripSummary = computed(() => {
    if (!routeInfo.value) return null
    const totalKm = routeInfo.value.distance / 1000
    const totalHours = routeInfo.value.duration / 3600
    const days = routeByDays.value.length || 1
    return {
      totalKm: Math.round(totalKm),
      totalHours: Math.round(totalHours * 10) / 10,
      days,
      tolls: routeInfo.value.tolls,
      mainRoads: routeInfo.value.mainRoads
    }
  })

  // 计算路线并设置
  async function computeAndSetRoute(
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number },
    strategy: number = 2
  ) {
    isComputingRoute.value = true
    try {
      const routes = await computeRoute(origin, destination, strategy)
      availableRoutes.value = routes
      if (routes.length > 0) {
        routeInfo.value = routes[0] as any
        globalStrategy.value = strategy
      }
    } catch (err) {
      console.error('[routeStore] computeAndSetRoute failed:', err)
    } finally {
      isComputingRoute.value = false
    }
  }

  // 沿途景点搜索（BBox 粗筛 + 本地 SQLite）
  async function searchPoisByRoute() {
    // 1. 边界防御：检查高德路线数据是否存在
    if (!routeInfo.value || !routeInfo.value.polyline || routeInfo.value.polyline.length === 0) return
    
    const poiStore = usePoiStore()
    const radiusKms = poiStore.searchRadius || 20
    
    // 2. 将公里数粗略转化为经纬度扩张增量 (1度约111公里)
    const degreeDelta = radiusKms / 111.0

    // 3. 计算 Polyline 的原始 BBox 边界 (polyline格式: [lng, lat][])
    const lats = routeInfo.value.polyline.map(p => Number(p[1]))
    const lngs = routeInfo.value.polyline.map(p => Number(p[0]))
    
    // 4. 施加公里数范围约束（外扩上下左右边界）
    const bbox = {
      min_lat: Math.min(...lats) - degreeDelta,
      max_lat: Math.max(...lats) + degreeDelta,
      min_lng: Math.min(...lngs) - degreeDelta,
      max_lng: Math.max(...lngs) + degreeDelta
    }

    try {
      poiStore.isLoading = true
      
      // 5. 对齐本地后端接口：使用 fetch 发送数组格式的 bounds_list
      const response = await fetch('/api/pois/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounds_list: [bbox], limit: 100 })
      })
      
      if (!response.ok) throw new Error('网络请求失败')
      const rawData = await response.json()
      
      // 6. 数据清洗与强行归一化倒灌（映射本地字段）
      const pois = rawData.pois || []
      poiStore.candidatePois = pois.map((p: any) => ({
        poi_id: p.ctrip_id ? `ctrip_${p.ctrip_id}` : p.osm_id ? `ctrip_${p.osm_id}` : `ctrip_${Math.random()}`,
        name: p.gaode_name || p.name || '未知景点',
        lat: Number(p.lat),
        lng: Number(p.lng),
        category: p.review_tags || p.keytag || '其它',
        rating: p.review_good_rate || 4.2,
        cover_url: p.cover_image_url || '',
        keytag: p.keytag || '',
        review_total: p.review_total || 0,
        short_features: p.tips ? [p.tips] : []
      }))
      
    } catch (error) {
      console.error('长廊搜索失败:', error)
    } finally {
      poiStore.isLoading = false
    }
  }

  // 纯函数操作
  function addWaypoint(poi: CtripPOI, index?: number) {
    if (waypoints.value.some(wp => wp.id === poi.poi_id)) return
    
    const newWp: Waypoint = {
      id: poi.poi_id,
      poi_details: poi,
      isOvernight: false
    }
    
    if (typeof index === 'number') {
      waypoints.value.splice(index, 0, newWp)
    } else {
      waypoints.value.push(newWp)
    }
  }

  function removeWaypoint(poiId: string) {
    waypoints.value = waypoints.value.filter(wp => wp.id !== poiId)
  }

  function reorderWaypoints(newOrder: Waypoint[]) {
    waypoints.value = newOrder
  }

  function toggleOvernight(poiId: string) {
    const wp = waypoints.value.find(w => w.id === poiId)
    if (wp) wp.isOvernight = !wp.isOvernight
  }

  function clearWaypoints() {
    waypoints.value = []
  }

  return {
    waypoints,
    globalStrategy,
    routeInfo,
    isComputingRoute,
    availableRoutes,
    routeByDays,
    isEmpty,
    tripSummary,
    computeAndSetRoute,
    searchPoisByRoute,
    addWaypoint,
    removeWaypoint,
    reorderWaypoints,
    toggleOvernight,
    clearWaypoints,
    activeDayIndex,
    activeWaypointId
  }
})
