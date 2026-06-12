<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const input = ref('')

function handleSend() {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="border-t border-gray-200 p-3 bg-white">
    <div class="flex items-end gap-2">
      <textarea
        v-model="input"
        placeholder="输入你的旅行需求..."
        rows="2"
        :disabled="disabled"
        class="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 min-h-[40px] max-h-[120px]"
        @keydown="handleKeydown"
      />
      <button
        class="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 flex-shrink-0"
        :disabled="!input.trim() || disabled"
        @click="handleSend"
      >
        发送
      </button>
    </div>
  </div>
</template>
