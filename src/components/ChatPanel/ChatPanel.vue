<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage, refreshMessages, isPolling, currentSessionId } = useAI()
const messagesEnd = ref<HTMLElement>()

watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
    })
  }
)

async function handleSend(text: string) {
  await sendMessage(text)
}

async function handleRefresh() {
  await refreshMessages()
}
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-800">AI 旅行顾问</h2>
        <div class="flex items-center gap-2">
          <span v-if="currentSessionId" class="text-xs text-gray-400">
            {{ currentSessionId.slice(0, 12) }}...
          </span>
          <button
            @click="handleRefresh"
            class="text-gray-400 hover:text-gray-600"
            title="刷新"
          >
            ↻
          </button>
        </div>
      </div>
      <p class="text-xs text-gray-500">
        {{ isPolling ? '等待 AI 回复...' : store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isPolling" class="flex justify-start">
        <div class="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
          <span class="inline-flex gap-1">
            <span class="animate-bounce" style="animation-delay: 0ms">.</span>
            <span class="animate-bounce" style="animation-delay: 150ms">.</span>
            <span class="animate-bounce" style="animation-delay: 300ms">.</span>
          </span>
        </div>
      </div>
      <div ref="messagesEnd" />
    </div>
    <ChatInput @send="handleSend" :disabled="isPolling" />
  </div>
</template>
