<script setup lang="ts">
const props = defineProps<{
  hours: number
  limit: number
}>()

const percentage = Math.min((props.hours / props.limit) * 100, 100)
const isOver = props.hours > props.limit
</script>

<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
    <div
      :class="['h-full rounded-full transition-all', isOver ? 'bg-red-500' : 'bg-blue-500']"
      :style="{ width: `${percentage}%` }"
    />
  </div>
  <div class="mt-1 flex justify-between text-xs text-gray-500">
    <span>{{ hours.toFixed(1) }}h</span>
    <span :class="isOver ? 'text-red-500 font-medium' : ''">
      {{ isOver ? '超出限制' : `/${limit}h` }}
    </span>
  </div>
</template>
