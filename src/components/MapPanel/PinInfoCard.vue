<script setup lang="ts">
import type { Location } from '@/types'
import { CATEGORY_LABELS } from '@/constants/categories'

const props = defineProps<{
  location: Location
}>()

const emit = defineEmits<{
  close: []
  toggle: []
}>()
</script>

<template>
  <div class="absolute bottom-4 left-4 right-4 rounded-xl bg-white p-4 shadow-lg z-10">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="text-lg font-semibold">{{ location.name }}</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {{ CATEGORY_LABELS[location.category] }}
          </span>
        </div>
        <p class="mt-1 text-sm text-gray-600">{{ location.description }}</p>
      </div>
      <button
        class="ml-2 text-gray-400 hover:text-gray-600"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div class="mt-3 flex gap-2">
      <button
        :class="[
          'rounded-lg px-3 py-1.5 text-sm font-medium',
          location.selected
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ]"
        @click="emit('toggle')"
      >
        {{ location.selected ? '已选中' : '添加到行程' }}
      </button>
    </div>
  </div>
</template>
