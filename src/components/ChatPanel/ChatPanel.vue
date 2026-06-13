<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
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

const taglines = [
  '轻松定制你的自驾路书',
  '不再错过沿途那些最值得的风景',
]
const taglineIndex = ref(0)
const taglineOpacity = ref(1)
let taglineTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  function cycle() {
    // 5s 后开始渐隐
    taglineTimer = setTimeout(() => {
      taglineOpacity.value = 0
      // 3s 渐隐完成 + 1s 等待 = 4s 后切文字直接显示
      setTimeout(() => {
        taglineIndex.value = (taglineIndex.value + 1) % taglines.length
        taglineOpacity.value = 1
        cycle()
      }, 4000)
    }, 5000)
  }
  cycle()
})
onUnmounted(() => {
  if (taglineTimer) clearTimeout(taglineTimer)
})

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
  <div class="h-full flex flex-col overflow-hidden bg-white">
    <!-- Header -->
    <div class="flex-none border-b border-[#E8DCC7]" style="padding: 10px 10px 4px 8px;">
      <div class="flex items-start" style="gap: 20px;">
        <!-- Logo -->
        <div class="flex-shrink-0">
          <img src="/logo.png" alt="随心自驾" class="rounded-full" style="width: 48px; height: 48px; object-fit: cover;" />
        </div>
        <!-- 标题 + 简介 + 装饰 -->
        <div class="flex-1 min-w-0 relative">
          <h2 class="font-bold text-[#2D2A26] leading-tight" style="font-size: 24px;">随心自驾</h2>
          <p
            class="text-[#8B8578] overflow-hidden transition-opacity duration-3000 leading-tight"
            style="font-size: 12px; margin-top: 4px; height: 16px;"
            :style="{ opacity: taglineOpacity }"
          >{{ taglines[taglineIndex] }}</p>
          <!-- 三色装饰条 -->
          <svg class="absolute" style="top: -2px; right: -2px;" width="26" height="22" viewBox="0 0 26 22">
            <rect x="3" y="1" width="4" height="20" rx="2" fill="#7EB8DA" transform="rotate(-10 5 11)"/>
            <rect x="10" y="1" width="4" height="20" rx="2" fill="#E8C547" transform="rotate(-10 12 11)"/>
            <rect x="17" y="1" width="4" height="20" rx="2" fill="#C66B3D" transform="rotate(-10 19 11)"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- 状态栏 + 历史会话 -->
    <div class="flex-none flex items-center justify-between px-4 py-2 bg-[#FAFAF7] border-b border-[#E8DCC7]">
      <p class="text-xs text-[#8B8578]">
        {{ isPolling ? '等待回复...' : store.planningStatus === 'collecting' ? '收集信息中...' : '规划中...' }}
      </p>
      <div class="relative">
        <button
          @click="handleRefreshSessions"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[#8B8578] hover:text-[#C66B3D] hover:bg-[#F5F0E8] transition-colors"
        >
          <span>历史会话</span>
          <span class="text-[8px] transition-transform" :class="showSessionList ? 'rotate-90' : ''">&#9654;</span>
        </button>
        <div
          v-if="showSessionList && sessions.length > 0"
          class="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-[#E8DCC7] z-50 max-h-64 overflow-y-auto"
        >
          <div class="p-2">
            <p class="text-[10px] text-[#8B8578] px-2 py-1 uppercase tracking-wider">历史会话</p>
            <button
              v-for="session in sessions"
              :key="session.id"
              :class="[
                'w-full text-left px-3 py-2 rounded-lg text-[11px] transition-colors',
                session.id === currentSessionId ? 'bg-[#FDF2EC] text-[#C66B3D]' : 'hover:bg-[#F5F0E8] text-[#2D2A26]',
              ]"
              @click="handleLoadSession(session.id)"
            >
              <div class="flex items-center justify-between">
                <span class="truncate">{{ session.id.slice(0, 20) }}...</span>
                <span class="text-[10px] text-[#8B8578] ml-2">{{ formatDate(session.lastModified) }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainer"
      class="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
    >
      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isPolling" class="flex justify-start">
        <div class="bg-[#F5F0E8] rounded-2xl px-4 py-2.5">
          <span class="inline-flex gap-1">
            <span class="w-1.5 h-1.5 bg-[#C66B3D] rounded-full animate-bounce"></span>
            <span class="w-1.5 h-1.5 bg-[#C66B3D] rounded-full animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-1.5 h-1.5 bg-[#C66B3D] rounded-full animate-bounce" style="animation-delay: 300ms"></span>
          </span>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="flex-none">
      <ChatInput @send="handleSend" :disabled="isPolling" />
    </div>
  </div>
</template>

<style scoped>
.overflow-y-auto::-webkit-scrollbar { width: 4px; }
.overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
.overflow-y-auto::-webkit-scrollbar-thumb { background-color: #D4CBBC; border-radius: 2px; }
</style>
