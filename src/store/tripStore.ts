import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripParams, Location, DrivingLeg, ItineraryDay, ConversationMessage } from '@/types'
import { DAILY_LIMIT_DEFAULT, HOTEL_BUDGET_DEFAULT } from '@/constants/defaults'

const MOCK_ORIGIN = { query: '上海', lat: 31.2304, lon: 121.4737, shortName: '上海, 中国', fullName: '上海市, 中国' }
const MOCK_DESTINATION = { query: '成都', lat: 30.5728, lon: 104.0668, shortName: '成都, 中国', fullName: '成都市, 四川省, 中国' }

const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc_hangzhou',
    name: '杭州西湖',
    shortName: '杭州, 浙江',
    lat: 30.2500,
    lon: 120.1500,
    category: 'scenic',
    description: 'UNESCO世界遗产，环绕着古塔和茶园。建议停留3-4小时。',
    suggested: true,
    selected: true,
    dayHint: 1,
  },
  {
    id: 'loc_huangshan',
    name: '黄山',
    shortName: '黄山, 安徽',
    lat: 30.1375,
    lon: 118.1694,
    category: 'nature',
    description: '中国最著名的山脉之一，以奇松、怪石、云海闻名。建议停留1-2天。',
    suggested: true,
    selected: true,
    dayHint: 2,
  },
  {
    id: 'loc_wuyishan',
    name: '武夷山',
    shortName: '武夷山, 福建',
    lat: 27.7583,
    lon: 117.6613,
    category: 'nature',
    description: '丹霞地貌与九曲溪竹筏漂流。建议停留1天。',
    suggested: true,
    selected: true,
    dayHint: 3,
  },
  {
    id: 'loc_changsha_food',
    name: '长沙美食',
    shortName: '长沙, 湖南',
    lat: 28.2282,
    lon: 112.9388,
    category: 'food',
    description: '臭豆腐、小龙虾、茶颜悦色。长沙是美食之都。',
    suggested: true,
    selected: false,
    dayHint: 4,
  },
]

const MOCK_MESSAGES: ConversationMessage[] = [
  {
    id: 'msg_1',
    role: 'user',
    text: '我想从上海自驾去成都，大概10天时间，每天开5小时左右',
    timestamp: new Date('2026-06-12T10:00:00'),
  },
  {
    id: 'msg_2',
    role: 'assistant',
    text: '好的！上海到成都自驾是个很棒的路线。我来帮你规划一下。\n\n根据你的10天行程和每天5小时的驾驶限制，我建议走这条经典路线：\n上海 → 杭州 → 黄山 → 武夷山 → 长沙 → 张家界 → 重庆 → 成都\n\n沿途有很多值得停留的地方，我已经在地图上标注了一些推荐地点。你看看这些地方感兴趣吗？',
    timestamp: new Date('2026-06-12T10:00:05'),
  },
]

const MOCK_DRIVING_LEGS: DrivingLeg[] = [
  { fromId: 'loc_origin', toId: 'loc_hangzhou', distanceKm: 170, durationHours: 2.0 },
  { fromId: 'loc_hangzhou', toId: 'loc_huangshan', distanceKm: 250, durationHours: 3.0 },
  { fromId: 'loc_huangshan', toId: 'loc_wuyishan', distanceKm: 350, durationHours: 4.0 },
  { fromId: 'loc_wuyishan', toId: 'loc_changsha_food', distanceKm: 600, durationHours: 7.0 },
]

const MOCK_ITINERARY: ItineraryDay[] = [
  {
    dayNumber: 1,
    date: null,
    overnightLocation: MOCK_LOCATIONS[0],
    stops: [MOCK_LOCATIONS[0]],
    totalDriveHours: 2.0,
    totalDistanceKm: 170,
    isOverLimit: false,
  },
  {
    dayNumber: 2,
    date: null,
    overnightLocation: MOCK_LOCATIONS[1],
    stops: [MOCK_LOCATIONS[1]],
    totalDriveHours: 3.0,
    totalDistanceKm: 250,
    isOverLimit: false,
  },
  {
    dayNumber: 3,
    date: null,
    overnightLocation: MOCK_LOCATIONS[2],
    stops: [MOCK_LOCATIONS[2]],
    totalDriveHours: 4.0,
    totalDistanceKm: 350,
    isOverLimit: false,
  },
  {
    dayNumber: 4,
    date: null,
    overnightLocation: MOCK_LOCATIONS[3],
    stops: [MOCK_LOCATIONS[3]],
    totalDriveHours: 7.0,
    totalDistanceKm: 600,
    isOverLimit: true,
  },
]

export const useTripStore = defineStore('trip', () => {
  const params = ref<TripParams>({
    origin: MOCK_ORIGIN,
    destination: MOCK_DESTINATION,
    totalDays: 10,
    departureDate: null,
    dailyDrivingLimitHours: DAILY_LIMIT_DEFAULT,
    hotelBudget: HOTEL_BUDGET_DEFAULT,
    travelStyle: ['nature', 'food'],
  })

  const locations = ref<Location[]>(MOCK_LOCATIONS)
  const drivingLegs = ref<DrivingLeg[]>(MOCK_DRIVING_LEGS)
  const itinerary = ref<ItineraryDay[]>(MOCK_ITINERARY)
  const messages = ref<ConversationMessage[]>(MOCK_MESSAGES)
  const isLoading = ref(false)
  const selectedDay = ref<number | null>(null)
  const selectedLocationId = ref<string | null>(null)
  const planningStatus = ref<'collecting' | 'planning' | 'refining'>('planning')

  const confirmedLocations = computed(() =>
    locations.value.filter((l) => l.selected)
  )

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
    addLocation,
    toggleLocation,
    removeLocation,
    addMessage,
    setSelectedDay,
    setSelectedLocation,
  }
})
