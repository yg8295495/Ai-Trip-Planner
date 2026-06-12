<script setup lang="ts">
/**
 * 天气面板
 * 触发：路线确认 + 大致景点选定后
 * 流程：选出发日 -> 批量取天气 -> 显示
 */
import { ref, computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { getWeatherBatch, daysUntil, weatherAccuracyHint, type WeatherCast } from '@/services/amapWeather'

const store = useTripStore()
const showPanel = ref(false)
const showDatePicker = ref(false)
const pickedDate = ref<string>(new Date().toISOString().slice(0, 10))

// 提取路线经过的所有城市 adcode
const cityAdcodes = computed<string[]>(() => {
  if (!store.routeInfo) return []
  return store.routeInfo.cities.map(c => c.code).filter(Boolean) as string[]
})

// 出发日距今天数
const days = computed(() => daysUntil(store.departureDate ? new Date(store.departureDate) : null))
const accuracy = computed(() => weatherAccuracyHint(days.value))

async function handleOpen() {
  showPanel.value = true
  if (!store.departureDate) {
    showDatePicker.value = true
    return
  }
  await fetchAll()
}

async function handleConfirmDate() {
  store.setDepartureDate(new Date(pickedDate.value))
  showDatePicker.value = false
  await fetchAll()
}

async function fetchAll() {
  if (cityAdcodes.value.length === 0) return
  store.isLoadingWeather = true
  try {
    const map = await getWeatherBatch(cityAdcodes.value)
    map.forEach((data, adcode) => {
      store.setWeather(adcode, data)
    })
  } finally {
    store.isLoadingWeather = false
  }
}

// 按日期索引 casts（city -> casts[]）
function getCastByDate(cityAdcode: string, dayIndex: number): WeatherCast | null {
  const w = store.weatherByAdcode[cityAdcode]
  if (!w || !w.casts) return null
  // dayIndex: 0=today, 1=tomorrow...
  // 如果没设出发日，用 today
  const baseDate = store.departureDate ? new Date(store.departureDate) : new Date()
  baseDate.setHours(0, 0, 0, 0)
  baseDate.setDate(baseDate.getDate() + dayIndex)
  const target = baseDate.toISOString().slice(0, 10).replace(/-/g, '.')
  return w.casts.find(c => c.date === target) || w.casts[dayIndex] || null
}

function weatherEmoji(c: WeatherCast | null): string {
  if (!c) return '🌍'
  const w = c.dayweather || ''
  if (w.includes('雨')) return '🌧️'
  if (w.includes('雪')) return '❄️'
  if (w.includes('云')) return '⛅'
  if (w.includes('阴')) return '☁️'
  if (w.includes('晴')) return '☀️'
  return '🌤️'
}

function handleClose() {
  showPanel.value = false
}
</script>

<template>
  <div v-if="showPanel" class="border-b border-gray-100 bg-gradient-to-br from-blue-50 to-cyan-50">
    <!-- Header -->
    <div class="px-4 py-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-gray-700">🌤️ 行程天气</span>
        <span v-if="store.departureDate" class="text-xs text-gray-500">
          {{ pickedDate }} 出发
        </span>
        <span
          :class="[
            'text-xs px-1.5 py-0.5 rounded',
            accuracy.level === 'accurate' ? 'bg-green-100 text-green-700' :
            accuracy.level === 'ok' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700',
          ]"
        >
          {{ accuracy.message }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="text-xs text-blue-500 hover:text-blue-700"
          @click="showDatePicker = !showDatePicker"
        >
          📅 改日期
        </button>
        <button class="text-gray-400 hover:text-gray-600 text-sm" @click="handleClose">✕</button>
      </div>
    </div>

    <!-- 日期选择 -->
    <div v-if="showDatePicker" class="px-4 py-2 border-t border-blue-100">
      <div class="flex items-center gap-2">
        <input
          v-model="pickedDate"
          type="date"
          class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
        />
        <button
          class="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
          @click="handleConfirmDate"
        >
          确定
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.isLoadingWeather" class="px-4 py-3 text-center text-xs text-gray-500">
      <span class="inline-block animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full mr-1"></span>
      正在获取 {{ cityAdcodes.length }} 个城市天气...
    </div>

    <!-- 城市天气列表 -->
    <div v-else class="px-4 pb-3 max-h-64 overflow-y-auto">
      <div v-if="cityAdcodes.length === 0" class="text-xs text-gray-400 text-center py-2">
        路线未确认
      </div>
      <div v-else class="space-y-1.5">
        <div
          v-for="city in store.routeInfo?.cities"
          :key="city.code"
          class="flex items-center justify-between bg-white rounded-lg px-3 py-2"
        >
          <div class="flex items-center gap-2">
            <span class="text-base">{{ weatherEmoji(getCastByDate(city.code, 0)) }}</span>
            <div>
              <p class="text-sm font-medium text-gray-700">{{ city.name }}</p>
              <p class="text-xs text-gray-400">
                {{ getCastByDate(city.code, 0)?.dayweather || '—' }}
              </p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-semibold text-gray-700">
              {{ getCastByDate(city.code, 0)?.daytemp || '—' }}°
            </p>
            <p class="text-xs text-gray-400">
              夜 {{ getCastByDate(city.code, 0)?.nighttemp || '—' }}°
            </p>
          </div>
        </div>
      </div>

      <!-- 未来几天 -->
      <div v-if="store.departureDate && !store.isLoadingWeather" class="mt-3 pt-2 border-t border-blue-100">
        <p class="text-xs text-gray-500 mb-1.5">📆 接下来几天</p>
        <div class="grid grid-cols-3 gap-1.5">
          <div
            v-for="d in 3"
            :key="d"
            class="bg-white rounded px-2 py-1.5 text-center"
          >
            <p class="text-xs text-gray-500">D+{{ d }}</p>
            <p class="text-sm">{{ weatherEmoji(getCastByDate(cityAdcodes[0] || '', d)) }}</p>
            <p class="text-xs font-medium text-gray-700">
              {{ getCastByDate(cityAdcodes[0] || '', d)?.daytemp || '—' }}°
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 入口按钮 -->
  <div v-else class="border-b border-gray-100 px-4 py-2">
    <button
      v-if="store.routeInfo"
      class="w-full text-xs text-blue-500 hover:text-blue-700 py-1"
      @click="handleOpen"
    >
      🌤️ 查看天气
    </button>
  </div>
</template>
