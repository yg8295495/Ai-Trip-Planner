<script setup lang="ts">
import type { ConversationMessage } from '@/types'

const props = defineProps<{
  message: ConversationMessage
}>()

function formatText(text: string): string {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-200 px-1 rounded text-xs">$1</code>')
}
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        message.role === 'user'
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-800',
      ]"
    >
      <div v-html="formatText(message.text)" />
    </div>
  </div>
</template>
