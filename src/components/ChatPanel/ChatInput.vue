<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

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
  <div class="border-t border-[var(--color-border)] p-3 bg-white">
    <div class="flex items-end gap-2">
      <textarea
        v-model="input"
        placeholder="输入旅行需求..."
        rows="2"
        :disabled="disabled"
        class="flex-1 resize-none rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50 min-h-[40px] max-h-[120px] bg-[var(--color-surface-alt)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-colors"
        @keydown="handleKeydown"
      />
      <button
        class="rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-[var(--color-surface)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex-shrink-0 flex items-center gap-1.5 transition-colors"
        :disabled="!input.trim() || disabled"
        @click="handleSend"
      >
        <Icon icon="ph:paper-plane-tilt" :width="16" :height="16" />
        <span class="text-xs font-medium">发送</span>
      </button>
    </div>
  </div>
</template>
