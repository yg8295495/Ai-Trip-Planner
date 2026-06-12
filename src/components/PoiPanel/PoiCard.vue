<script setup lang="ts">
import type { PoiInfo } from '@/store/tripStore'

const props = defineProps<{
  poi: PoiInfo
  isSelected: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

function getCategoryLabel(type: string): string {
  if (type.includes('风景名胜')) return '景点'
  if (type.includes('餐饮')) return '美食'
  if (type.includes('住宿')) return '住宿'
  if (type.includes('购物')) return '购物'
  return '其他'
}

function getCategoryColor(type: string): string {
  if (type.includes('风景名胜')) return 'bg-green-100 text-green-700'
  if (type.includes('餐饮')) return 'bg-yellow-100 text-yellow-700'
  if (type.includes('住宿')) return 'bg-purple-100 text-purple-700'
  if (type.includes('购物')) return 'bg-blue-100 text-blue-700'
  return 'bg-gray-100 text-gray-700'
}
</script>

<template>
  <div
    :class="[
      'p-3 rounded-lg border cursor-pointer transition-all',
      isSelected
        ? 'border-green-500 bg-green-50'
        : 'border-gray-200 bg-white hover:border-gray-300',
    ]"
    @click="emit('toggle')"
  >
    <div class="flex items-start gap-3">
      <!-- 图片 -->
      <div
        v-if="poi.photos && poi.photos.length > 0"
        class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0"
      >
        <img
          :src="poi.photos[0].url"
          :alt="poi.name"
          class="w-full h-full object-cover"
        />
      </div>
      <div
        v-else
        class="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0"
      >
        <span class="text-2xl">📷</span>
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-medium text-gray-800 truncate">{{ poi.name }}</h4>
          <span
            :class="['px-1.5 py-0.5 rounded text-xs', getCategoryColor(poi.type)]"
          >
            {{ getCategoryLabel(poi.type) }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mt-0.5">{{ poi.cityname }} {{ poi.adname }}</p>
        <p v-if="poi.rating" class="text-xs text-yellow-600 mt-0.5">
          ⭐ {{ poi.rating }}
          <span v-if="poi.cost" class="text-gray-500 ml-2">¥{{ poi.cost }}/人</span>
        </p>
      </div>

      <!-- 选择状态 -->
      <div class="flex-shrink-0">
        <div
          :class="[
            'w-5 h-5 rounded-full border-2 flex items-center justify-center',
            isSelected
              ? 'border-green-500 bg-green-500'
              : 'border-gray-300',
          ]"
        >
          <svg
            v-if="isSelected"
            class="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
