<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage, isPolling } = useAI()
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
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex-shrink-0 border-b border-gray-100 px-4 py-3 bg-white">
      <h2 class="text-base font-semibold text-gray-800">AI 旅行顾问</h2>
      <p class="text-xs text-gray-400 mt-0.5">
        {{ isPolling ? '等待 AI 回复...' : store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isPolling" class="flex justify-start">
        <div class="bg-gray-100 rounded-2xl px-4 py-2.5">
          <span class="inline-flex gap-1">
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
          </span>
        </div>
      </div>
      <div ref="messagesEnd" />
    </div>

    <!-- Input -->
    <div class="flex-shrink-0">
      <ChatInput @send="handleSend" :disabled="isPolling" />
    </div>
  </div>
</template>
