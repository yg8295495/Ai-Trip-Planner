<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { useAI } from '@/composables/useAI'
import { useSession } from '@/composables/useSession'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const store = useTripStore()
const { sendMessage, isPolling } = useAI()
const { sessions, loadSession, refreshSessions, currentSessionId } = useSession()
const messagesContainer = ref<HTMLElement>()
const showSessionList = ref(false)

watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
)

async function handleSend(text: string) {
  await sendMessage(text)
}

async function handleLoadSession(sessionId: string) {
  await loadSession(sessionId)
  showSessionList.value = false
}

async function handleRefreshSessions() {
  await refreshSessions()
  showSessionList.value = !showSessionList.value
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <!-- 使用绝对定位实现固定头部和底部 -->
  <div class="relative h-full w-full bg-white">
    <!-- Header - 固定在顶部 -->
    <div class="absolute top-0 left-0 right-0 z-10 border-b border-gray-100 px-4 py-3 bg-white">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-800">AI 旅行顾问</h2>
        <div class="relative">
          <button
            @click="handleRefreshSessions"
            class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="会话列表"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div
            v-if="showSessionList && sessions.length > 0"
            class="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-64 overflow-y-auto"
          >
            <div class="p-2">
              <p class="text-xs text-gray-400 px-2 py-1">历史会话</p>
              <button
                v-for="session in sessions"
                :key="session.id"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  session.id === currentSessionId
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50 text-gray-700',
                ]"
                @click="handleLoadSession(session.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="truncate">{{ session.id.slice(0, 20) }}...</span>
                  <span class="text-xs text-gray-400 ml-2">{{ formatDate(session.lastModified) }}</span>
                </div>
                <p class="text-xs text-gray-400 mt-0.5">{{ session.messageCount }} 条消息</p>
              </button>
            </div>
          </div>
        </div>
      </div>
      <p class="text-xs text-gray-400 mt-0.5">
        {{ isPolling ? '等待 AI 回复...' : store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
    </div>

    <!-- Input - 固定在底部 -->
    <div class="absolute bottom-0 left-0 right-0 z-10">
      <ChatInput @send="handleSend" :disabled="isPolling" />
    </div>

    <!-- Messages - 中间可滚动区域 -->
    <div
      ref="messagesContainer"
      class="absolute top-[88px] bottom-[72px] left-0 right-0 overflow-y-auto px-4 py-3 space-y-3"
      style="scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;"
    >
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
    </div>
  </div>
</template>

<style scoped>
/* WebKit 滚动条 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 3px;
}
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background-color: #94a3b8;
}
</style>
