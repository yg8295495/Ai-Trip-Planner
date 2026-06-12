<script setup lang="ts">
import { computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import DayCard from './DayCard.vue'

const store = useTripStore()

const displayLocations = computed(() => {
  // 显示所有景点（已确认 + AI推荐）
  return store.locations
})

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="border-b border-gray-200 px-4 py-3 flex-shrink-0">
      <h2 class="text-lg font-semibold text-gray-800">行程安排</h2>
      <p class="text-xs text-gray-500">
        {{ store.confirmedLocations.length }}个已确认 · {{ store.locations.length }}个推荐
      </p>
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
