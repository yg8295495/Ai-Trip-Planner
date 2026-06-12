<script setup lang="ts">
import type { ItineraryDay } from '@/types'
import DriveTimeBar from './DriveTimeBar.vue'

const props = defineProps<{
  day: ItineraryDay
  drivingLimit: number
  isSelected: boolean
}>()

const emit = defineEmits<{
  select: [dayNumber: number]
}>()
</script>

<template>
  <div
    :class="[
      'w-full cursor-pointer rounded-xl border-2 p-4 transition-all',
      isSelected
        ? 'border-blue-500 bg-blue-50'
        : day.isOverLimit
          ? 'border-red-300 bg-red-50'
          : 'border-gray-200 bg-white hover:border-gray-300',
    ]"
    @click="emit('select', day.dayNumber)"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-800">Day {{ day.dayNumber }}</span>
      <span v-if="day.isOverLimit" class="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
        超限
      </span>
    </div>
    <p class="mt-1 text-xs text-gray-500">
      📍 {{ day.overnightLocation.shortName }}
    </p>
    <p class="mt-1 text-xs text-gray-500">
      🚗 {{ day.totalDistanceKm }}km · {{ day.stops.length }}个停靠点
    </p>
    <div class="mt-3">
      <DriveTimeBar :hours="day.totalDriveHours" :limit="drivingLimit" />
    </div>
  </div>
</template>
