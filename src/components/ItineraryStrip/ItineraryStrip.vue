<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import DayCard from './DayCard.vue'

const store = useTripStore()

const originInput = ref(store.params.origin?.query || '')
const destinationInput = ref(store.params.destination?.query || '')

function handleConfirmRoute() {
  if (!originInput.value.trim() || !destinationInput.value.trim()) return

  // 设置起点终点
  store.params.origin = {
    query: originInput.value.trim(),
    lat: 0,
    lon: 0,
    shortName: originInput.value.trim(),
    fullName: originInput.value.trim(),
  }
  store.params.destination = {
    query: destinationInput.value.trim(),
    lat: 0,
    lon: 0,
    shortName: destinationInput.value.trim(),
    fullName: destinationInput.value.trim(),
  }
}

function handleSelectDay(dayNumber: number) {
  store.setSelectedDay(store.selectedDay === dayNumber ? null : dayNumber)
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

    <!-- 起点终点输入 -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-100">
      <div class="flex items-center gap-3 mb-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <div class="w-0.5 h-8 bg-gray-200"></div>
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
        </div>
        <div class="flex-1 space-y-2">
          <input
            v-model="originInput"
            placeholder="输入起点（如：长沙）"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
          <input
            v-model="destinationInput"
            placeholder="输入终点（如：昆明）"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      <button
        :disabled="!originInput.trim() || !destinationInput.trim()"
        class="w-full py-2 rounded-lg text-sm font-medium transition-colors"
        :class="originInput.trim() && destinationInput.trim()
          ? 'bg-blue-500 text-white hover:bg-blue-600'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
        @click="handleConfirmRoute"
      >
        确认路线
      </button>
    </div>

    <!-- AI 推荐景点 -->
    <div class="flex-shrink-0 px-4 py-2 border-b border-gray-100">
      <p class="text-xs text-gray-400">AI 推荐沿途景点</p>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-2">
      <div v-if="store.locations.length === 0" class="text-center py-8 text-gray-400 text-sm">
        确认路线后，AI 将推荐沿途景点
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
              <svg v-if="loc.selected" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
