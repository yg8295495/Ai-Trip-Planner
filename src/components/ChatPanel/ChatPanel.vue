<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage } = useAI()
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
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="border-b border-gray-200 px-4 py-3">
      <h2 class="text-lg font-semibold text-gray-800">AI 旅行顾问</h2>
      <p class="text-xs text-gray-500">
        {{ store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>
    <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="store.isLoading" class="flex justify-start">
        <div class="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
          思考中...
        </div>
      </div>
      <div ref="messagesEnd" />
    </div>
    <ChatInput @send="handleSend" :disabled="store.isLoading" />
  </div>
</template>
