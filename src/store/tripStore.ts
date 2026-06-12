import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripParams, Location, DrivingLeg, ItineraryDay, ConversationMessage } from '@/types'
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
}

export const useTripStore = defineStore('trip', () => {
  // 基础参数
  const params = ref<TripParams>({
    origin: { query: '上海', lat: 31.2304, lon: 121.4737, shortName: '上海, 中国', fullName: '上海市, 中国' },
    destination: { query: '成都', lat: 30.5728, lon: 104.0668, shortName: '成都, 中国', fullName: '成都市, 四川省, 中国' },
    totalDays: 10,
    departureDate: null,
    dailyDrivingLimitHours: DAILY_LIMIT_DEFAULT,
    hotelBudget: HOTEL_BUDGET_DEFAULT,
    travelStyle: ['nature', 'food'],
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

  // POI 相关
  const maxDeviation = ref<number>(30) // 默认偏离距离 30km
  const candidatePois = ref<PoiInfo[]>([])
  const selectedPois = ref<PoiInfo[]>([])
  const selectedPoi = ref<PoiInfo | null>(null)
  const isSearchingPois = ref(false)

  const confirmedLocations = computed(() =>
    locations.value.filter((l) => l.selected)
  )

  const filteredCities = computed(() => {
    if (!routeInfo.value) return []
    // TODO: 根据偏离距离筛选符合条件的城市
    return routeInfo.value.cities
  })

  // 路线操作
  function setRouteInfo(info: RouteInfo) {
    routeInfo.value = info
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
    maxDeviation,
    candidatePois,
    selectedPois,
    selectedPoi,
    isSearchingPois,
    filteredCities,
    setRouteInfo,
    setMaxDeviation,
    setCandidatePois,
    togglePoiSelection,
    setSelectedPoi,
    clearSelectedPois,
    confirmPoisAsWaypoints,
    addLocation,
    toggleLocation,
    removeLocation,
    addMessage,
    setSelectedDay,
    setSelectedLocation,
  }
})
