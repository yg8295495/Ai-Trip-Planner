<script setup lang="ts">
import { computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import DayCard from './DayCard.vue'

const store = useTripStore()

const displayLocations = computed(() => {
  return store.locations
})

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
}

function handleConfirmSelection() {
  // 用户确认选择，设置起点终点（用第一个和最后一个选中的地点）
  const selected = store.locations.filter(l => l.selected)
  if (selected.length >= 2) {
    store.params.origin = {
      query: selected[0].name,
      lat: selected[0].lat,
      lon: selected[0].lon,
      shortName: selected[0].shortName,
      fullName: selected[0].shortName,
    }
    store.params.destination = {
      query: selected[selected.length - 1].name,
      lat: selected[selected.length - 1].lat,
      lon: selected[selected.length - 1].lon,
      shortName: selected[selected.length - 1].shortName,
      fullName: selected[selected.length - 1].shortName,
    }
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <h2 class="text-base font-semibold text-gray-800">行程安排</h2>
      <p class="text-xs text-gray-400 mt-0.5">
        {{ store.confirmedLocations.length }}个已确认 · {{ store.locations.length }}个推荐
      </p>
    </div>

    <!-- 起点终点 -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <div class="w-0.5 h-6 bg-gray-200"></div>
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div class="flex-1 space-y-2">
          <div>
            <p class="text-xs text-gray-400">起点</p>
            <p class="text-sm font-medium text-gray-800">
              {{ store.params.origin?.shortName || '待选择（点击下方景点）' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-400">终点</p>
            <p class="text-sm font-medium text-gray-800">
              {{ store.params.destination?.shortName || '待选择（点击下方景点）' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 景点列表 -->
    <div class="flex-1 overflow-y-auto px-4 py-3">
      <div v-if="store.locations.length === 0" class="text-center py-8 text-gray-400 text-sm">
        暂无景点，等待 AI 推荐...
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="loc in store.locations"
          :key="loc.id"
          :class="[
            'p-3 rounded-lg border cursor-pointer transition-all',
            loc.selected
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-white hover:border-gray-300',
          ]"
          @click="store.toggleLocation(loc.id)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-800">{{ loc.name }}</span>
                <span
                  :class="[
                    'px-1.5 py-0.5 rounded text-xs',
                    loc.selected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                  ]"
                >
                  {{ loc.selected ? '已选' : '待选' }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">{{ loc.shortName }}</p>
            </div>
            <div
              :class="[
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                loc.selected ? 'border-green-500 bg-green-500' : 'border-gray-300',
              ]"
            >
              <svg
                v-if="loc.selected"
                class="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 确认按钮 -->
    <div v-if="store.locations.length > 0" class="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
      <button
        :disabled="store.confirmedLocations.length < 2"
        class="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
        :class="store.confirmedLocations.length >= 2
          ? 'bg-blue-500 text-white hover:bg-blue-600'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
        @click="handleConfirmSelection"
      >
        {{ store.confirmedLocations.length < 2
          ? `还需选择 ${2 - store.confirmedLocations.length} 个地点`
          : `确认路线 (${store.confirmedLocations.length}个地点)` }}
      </button>
    </div>

    <!-- 行程卡片 -->
    <div v-if="store.itinerary.length > 0" class="border-t border-gray-200 px-4 py-3 flex-shrink-0">
      <h3 class="text-sm font-semibold text-gray-700 mb-2">每日行程</h3>
      <div class="flex flex-col gap-2">
        <DayCard
          v-for="day in store.itinerary"
          :key="day.dayNumber"
          :day="day"
          :driving-limit="store.params.dailyDrivingLimitHours"
          :is-selected="store.selectedDay === day.dayNumber"
          @select="handleSelectDay"
        />
      </div>
    </div>
  </div>
</template>
