import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripParams, Location, DrivingLeg, ItineraryDay, ConversationMessage, GeocodedPlace } from '@/types'
import { DAILY_LIMIT_DEFAULT, HOTEL_BUDGET_DEFAULT } from '@/constants/defaults'

export interface PoiInfo {
  id: string
  name: string
  type: string
  typecode: string
  address: string
  location: string
  cityname: string
  adname: string
  distance?: string
  rating?: string
  cost?: string
  photos?: { title: string; url: string }[]
  tel?: string
  tag?: string
}

export interface CityInfo {
  code: string
  name: string
}

export interface RouteInfo {
  distance: number
  duration: number
  cities: CityInfo[]
  polyline: number[][]
  strategy: number
  // === 决策辅助数据（高德 extensions=all 返回） ===
  tollDistance?: number          // 收费路段长度 (m)
  tolls?: number                 // 收费金额 (元)
  trafficLights?: number         // 红绿灯数
  highwayDistance?: number       // 高速路段长度 (m)
  mainRoads?: string[]           // 主要道路（高速/国道名）
}

export const useTripStore = defineStore('trip', () => {
  // 基础参数
  const params = ref<TripParams>({
    origin: null,
    destination: null,
    totalDays: null,
    departureDate: null,
    dailyDrivingLimitHours: DAILY_LIMIT_DEFAULT,
    hotelBudget: HOTEL_BUDGET_DEFAULT,
    travelStyle: [],
  })

  const locations = ref<Location[]>([])
  const drivingLegs = ref<DrivingLeg[]>([])
  const itinerary = ref<ItineraryDay[]>([])
  const messages = ref<ConversationMessage[]>([])
  const isLoading = ref(false)
  const selectedDay = ref<number | null>(null)
  const selectedLocationId = ref<string | null>(null)
  const planningStatus = ref<'collecting' | 'planning' | 'refining'>('collecting')

  // 路线信息
  const routeInfo = ref<RouteInfo | null>(null)
  const currentStrategy = ref<number>(2)            // 当前选中的策略
  const availableRoutes = ref<RouteInfo[]>([])      // 策略对比数据
  const routeAlternatives = ref<RouteInfo[]>([])    // 同一策略下的多条备选路线（10/13 系列）
  const isComputingRoute = ref(false)
  const isComputingStrategies = ref(false)

  // 地图控件（MapPanel 在 onMounted 时注入，ItineraryStrip 调）
  const mapControls = ref<{ panTo: (lng: number, lat: number, zoom?: number) => void } | null>(null)
  function setMapControls(c: typeof mapControls.value) {
    mapControls.value = c
  }

  // POI 抽屉
  const poiDrawerOpen = ref(false)
  function setPoiDrawerOpen(open: boolean) {
    poiDrawerOpen.value = open
  }

  // POI 相关
  const maxDeviation = ref<number>(30) // 默认偏离距离 30km
  const candidatePois = ref<PoiInfo[]>([])
  const selectedPois = ref<PoiInfo[]>([])
  const selectedPoi = ref<PoiInfo | null>(null)
  const isSearchingPois = ref(false)

  // 天气相关（adcode -> WeatherAll）
  const weatherByAdcode = ref<Record<string, import('@/services/amapWeather').WeatherAll | null>>({})
  const isLoadingWeather = ref(false)
  const departureDate = ref<Date | null>(null)

  const confirmedLocations = computed(() =>
    locations.value.filter((l) => l.selected)
  )

  const filteredCities = computed(() => {
    if (!routeInfo.value) return []
    // TODO: 根据偏离距离筛选符合条件的城市
    return routeInfo.value.cities
  })

  // 路线操作
  function setRouteInfo(info: RouteInfo | null) {
    routeInfo.value = info
  }

  function setOrigin(place: GeocodedPlace | null) {
    params.value.origin = place
  }

  function setDestination(place: GeocodedPlace | null) {
    params.value.destination = place
  }

  function setCurrentStrategy(s: number) {
    currentStrategy.value = s
  }

  function setAvailableRoutes(routes: RouteInfo[]) {
    availableRoutes.value = routes
  }

  function setRouteAlternatives(routes: RouteInfo[]) {
    routeAlternatives.value = routes
  }

  function selectAlternative(index: number) {
    if (routeAlternatives.value[index]) {
      routeInfo.value = routeAlternatives.value[index]
    }
  }

  // POI 操作
  function setMaxDeviation(km: number) {
    maxDeviation.value = km
  }

  function setCandidatePois(pois: PoiInfo[]) {
    candidatePois.value = pois
  }

  function togglePoiSelection(poi: PoiInfo) {
    const index = selectedPois.value.findIndex((p) => p.id === poi.id)
    if (index >= 0) {
      selectedPois.value.splice(index, 1)
    } else {
      selectedPois.value.push(poi)
    }
  }

  function removeCandidatePoi(id: string) {
    candidatePois.value = candidatePois.value.filter(p => p.id !== id)
    // 如果已选中也清掉
    selectedPois.value = selectedPois.value.filter(p => p.id !== id)
  }

  function removeSelectedPoi(id: string) {
    selectedPois.value = selectedPois.value.filter(p => p.id !== id)
  }

  function moveSelectedPoi(id: string, direction: 'up' | 'down') {
    const idx = selectedPois.value.findIndex(p => p.id === id)
    if (idx < 0) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= selectedPois.value.length) return
    const arr = selectedPois.value
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
  }

  function clearAllCandidatePois() {
    candidatePois.value = []
    selectedPois.value = []
  }

  function addCandidatePoi(poi: PoiInfo) {
    // 去重
    if (candidatePois.value.some(p => p.id === poi.id)) return
    candidatePois.value.unshift(poi)
  }

  function setSelectedPoi(poi: PoiInfo | null) {
    selectedPoi.value = poi
  }

  function clearSelectedPois() {
    selectedPois.value = []
  }

  function confirmPoisAsWaypoints() {
    // 将选中的 POI 转换为 Location 并添加到 locations
    selectedPois.value.forEach((poi) => {
      const [lon, lat] = poi.location.split(',').map(Number)
      const categoryMap: Record<string, Location['category']> = {
        '风景名胜': 'scenic',
        '餐饮服务': 'food',
        '住宿服务': 'hotel',
        '购物服务': 'city',
        '体育休闲服务': 'nature',
      }

      addLocation({
        id: `poi_${poi.id}`,
        name: poi.name,
        shortName: `${poi.cityname}, ${poi.adname}`,
        lat,
        lon,
        category: categoryMap[poi.type?.split(';')[0]] || 'scenic',
        description: poi.address || '',
        suggested: true,
        selected: true,
        dayHint: null,
      })
    })

    clearSelectedPois()
  }

  // 位置操作
  function addLocation(loc: Location) {
    locations.value.push(loc)
  }

  function toggleLocation(id: string) {
    const loc = locations.value.find((l) => l.id === id)
    if (loc) loc.selected = !loc.selected
  }

  function removeLocation(id: string) {
    locations.value = locations.value.filter((l) => l.id !== id)
  }

  function addMessage(msg: ConversationMessage) {
    messages.value.push(msg)
  }

  function setSelectedDay(day: number | null) {
    selectedDay.value = day
  }

  function setSelectedLocation(id: string | null) {
    selectedLocationId.value = id
  }

  // 搜索沿途景点（多边形搜索，1次API调用）
  async function searchPoisByRoute() {
    if (!routeInfo.value || routeInfo.value.polyline.length < 2) return

    isSearchingPois.value = true
    try {
      const { generateCorridorPolygon, searchPoisByPolygon } = await import('@/services/poiSearch')
      const polygon = generateCorridorPolygon(routeInfo.value.polyline, maxDeviation.value, 50)
      if (polygon.length > 0) {
        const pois = await searchPoisByPolygon(polygon, '110000', 25)
        candidatePois.value = pois
      }
    } finally {
      isSearchingPois.value = false
    }
  }

  // 解析单条 path 为 RouteInfo
  function parsePath(path: any, strategy: number): RouteInfo {
    const cities: { code: string; name: string }[] = []
    const cityMap = new Map<string, string>()
    const polylinePoints: number[][] = []
    const mainRoadsSet = new Set<string>()
    let tollDistance = 0
    let trafficLights = 0
    let highwayDistance = 0

    path.steps.forEach((step: any) => {
      if (step.cities) {
        step.cities.forEach((city: any) => {
          if (city.citycode && !cityMap.has(city.citycode)) {
            cityMap.set(city.citycode, city.name)
            cities.push({ code: city.citycode, name: city.name })
          }
        })
      }
      if (step.polyline) {
        step.polyline.split(';').forEach((point: string) => {
          const [lng, lat] = point.split(',').map(Number)
          polylinePoints.push([lng, lat])
        })
      }
      if (step.toll_distance) tollDistance += Number(step.toll_distance)
      if (step.traffic_lights) trafficLights += Number(step.traffic_lights)
      if (step.road && /高速|高架|快速路/.test(step.road) && step.distance) {
        highwayDistance += Number(step.distance)
        if (step.road.length >= 3 && step.road.length <= 12) mainRoadsSet.add(step.road)
      } else if (step.road && /[GH]?\d{1,3}|国道|省道|高速/.test(step.road) && step.road.length <= 12) {
        mainRoadsSet.add(step.road)
      }
    })

    return {
      distance: Number(path.distance),
      duration: Number(path.duration),
      cities,
      polyline: polylinePoints,
      strategy,
      tollDistance: tollDistance || undefined,
      tolls: path.tolls ? Number(path.tolls) : undefined,
      trafficLights: trafficLights || undefined,
      highwayDistance: highwayDistance || undefined,
      mainRoads: Array.from(mainRoadsSet).slice(0, 8),
    }
  }

  // 驾车路线请求：返回所有备选路径
  async function computeRoutes(
    origin: GeocodedPlace,
    dest: GeocodedPlace,
    strategy: number
  ): Promise<RouteInfo[]> {
    if (origin.lat == null || dest.lat == null) return []
    const key = 'c866b4e29221cbc714a4fc78060f23b7'
    const originLoc = `${origin.lon},${origin.lat}`
    const destLoc = `${dest.lon},${dest.lat}`

    const url = `https://restapi.amap.com/v3/direction/driving?` +
      `origin=${originLoc}&destination=${destLoc}&key=${key}&extensions=all&strategy=${strategy}`

    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== '1' || !data.route?.paths?.length) return []
      return data.route.paths.map((p: any) => parsePath(p, strategy))
    } catch (err) {
      console.error(`Route compute failed (strategy ${strategy}):`, err)
      return []
    }
  }

  // 预计算策略路线（取每条策略的第一条路线做对比）
  async function prefetchRoutes(
    origin: GeocodedPlace,
    dest: GeocodedPlace,
    strategies: number[] = [2, 13, 10]
  ): Promise<RouteInfo[]> {
    isComputingStrategies.value = true
    try {
      const results = await Promise.all(
        strategies.map(s => computeRoutes(origin, dest, s))
      )
      const valid: RouteInfo[] = []
      for (const routes of results) {
        if (routes.length > 0) valid.push(routes[0])
      }
      availableRoutes.value = valid
      return valid
    } finally {
      isComputingStrategies.value = false
    }
  }

  // 天气
  function setWeather(adcode: string, data: import('@/services/amapWeather').WeatherAll | null) {
    weatherByAdcode.value[adcode] = data
  }

  function setDepartureDate(d: Date | null) {
    departureDate.value = d
  }

  return {
    params,
    locations,
    drivingLegs,
    itinerary,
    messages,
    isLoading,
    selectedDay,
    selectedLocationId,
    planningStatus,
    confirmedLocations,
    routeInfo,
    currentStrategy,
    availableRoutes,
    routeAlternatives,
    isComputingRoute,
    isComputingStrategies,
    maxDeviation,
    candidatePois,
    selectedPois,
    selectedPoi,
    isSearchingPois,
    filteredCities,
    weatherByAdcode,
    isLoadingWeather,
    departureDate,
    mapControls,
    poiDrawerOpen,
    setMapControls,
    setPoiDrawerOpen,
    setRouteInfo,
    setOrigin,
    setDestination,
    setCurrentStrategy,
    setAvailableRoutes,
    setMaxDeviation,
    setCandidatePois,
    togglePoiSelection,
    removeCandidatePoi,
    removeSelectedPoi,
    moveSelectedPoi,
    clearAllCandidatePois,
    addCandidatePoi,
    setSelectedPoi,
    clearSelectedPois,
    confirmPoisAsWaypoints,
    addLocation,
    toggleLocation,
    removeLocation,
    addMessage,
    setSelectedDay,
    setSelectedLocation,
    searchPoisByRoute,
    computeRoutes,
    prefetchRoutes,
    setRouteAlternatives,
    selectAlternative,
    setWeather,
    setDepartureDate,
  }
})
