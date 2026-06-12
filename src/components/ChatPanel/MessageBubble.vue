<script setup lang="ts">
import type { ConversationMessage } from '@/types'

const props = defineProps<{
  message: ConversationMessage
}>()
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed',
        message.role === 'user'
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-800',
      ]"
    >
      {{ message.text }}
    </div>
  </div>
</template>
