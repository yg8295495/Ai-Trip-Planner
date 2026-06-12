<script setup lang="ts">
import { useTripStore } from '@/store/tripStore'
import DayCard from './DayCard.vue'

const store = useTripStore()

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="border-b border-gray-200 px-4 py-3 flex-shrink-0">
      <h2 class="text-lg font-semibold text-gray-800">行程安排</h2>
      <p class="text-xs text-gray-500">
        {{ store.confirmedLocations.length }}个景点 · {{ store.itinerary.length }}天
      </p>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3">
      <div class="flex flex-col gap-3">
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
