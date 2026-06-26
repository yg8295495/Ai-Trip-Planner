<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { useAI } from '@/composables/useAI'
import { Icon } from '@iconify/vue'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps<{
  onCollapse?: () => void
}>()

const store = useChatStore()
const { sendMessage, isPolling } = useAI()
const messagesContainer = ref<HTMLElement>()
const showModelSelector = ref(false)

// LLM 模型选择
const currentModel = ref<'mimo' | 'codebuddy'>('mimo')
const models = [
  { id: 'mimo' as const, name: 'MiMo', desc: '小米大模型，响应快' },
  { id: 'codebuddy' as const, name: 'CodeBuddy', desc: '编程助手，理解力强' },
]

const taglines = [
  '轻松定制你的自驾路书',
  '不再错过沿途那些最值得的风景',
]
const taglineIndex = ref(0)
const taglineOpacity = ref(1)
let taglineTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  function cycle() {
    taglineTimer = setTimeout(() => {
      taglineOpacity.value = 0
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
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden" style="background: var(--color-surface)">
    <!-- Header -->
    <div class="flex-none border-b" style="padding: 10px 10px 4px 8px; border-color: var(--color-border)">
      <div class="flex items-start" style="gap: 20px;">
        <!-- Logo -->
        <div class="flex-shrink-0">
          <img src="/logo.png" alt="随心自驾" class="rounded-full" style="width: 48px; height: 48px; object-fit: cover;" />
        </div>
        <!-- 标题 + 简介 -->
        <div class="flex-1 min-w-0">
          <h2 class="font-bold leading-tight" style="font-size: 24px; color: var(--color-text)">随心自驾</h2>
          <p
            class="overflow-hidden transition-opacity duration-3000 leading-tight"
            style="font-size: 12px; margin-top: 4px; height: 16px; color: var(--color-text-secondary)"
            :style="{ opacity: taglineOpacity }"
          >{{ taglines[taglineIndex] }}</p>
        </div>
        <!-- 三色装饰条 + 收起按钮（垂直排列，充满头部高度） -->
        <div class="flex flex-col items-center justify-between flex-shrink-0" style="height: 48px">
          <svg width="24" height="20" viewBox="0 0 26 22">
            <rect x="3" y="1" width="4" height="20" rx="2" fill="#7EB8DA" transform="rotate(-10 5 11)"/>
            <rect x="10" y="1" width="4" height="20" rx="2" fill="#E8C547" transform="rotate(-10 12 11)"/>
            <rect x="17" y="1" width="4" height="20" rx="2" fill="#C66B3D" transform="rotate(-10 19 11)"/>
          </svg>
          <button
            v-if="onCollapse"
            @click="onCollapse"
            class="flex items-center justify-center rounded-lg transition-colors"
            style="background: var(--color-primary-light); color: var(--color-primary)"
            title="收起侧边栏"
          >
            <Icon icon="ph:caret-left" :width="24" :height="20" />
          </button>
        </div>
      </div>
    </div>

    <!-- 状态栏 + 模型选择 + 历史会话 -->
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b" style="background: var(--color-surface-alt); border-color: var(--color-border)">
      <div class="flex items-center gap-2">
        <p class="text-xs" style="color: var(--color-text-secondary)">
          {{ isPolling ? '等待回复...' : '规划中...' }}
        </p>
        <span class="text-[10px]" style="color: var(--color-text-muted)">|</span>
        <button
          @click="showModelSelector = !showModelSelector"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style="color: var(--color-primary); background: var(--color-primary-light)"
        >
          {{ models.find(m => m.id === currentModel)?.name }}
          <Icon icon="ph:caret-down" :width="10" :height="10" />
        </button>
      </div>
      <!-- 历史会话功能已移除，新架构不再使用文件桥接 -->

      <!-- 模型选择下拉 -->
      <div
        v-if="showModelSelector"
        class="absolute right-16 top-full mt-1 w-48 rounded-xl shadow-lg z-50"
        style="background: var(--color-surface); border: 1px solid var(--color-border)"
      >
        <div class="p-2">
          <p class="text-[10px] px-2 py-1 uppercase tracking-wider" style="color: var(--color-text-secondary)">选择模型</p>
          <button
            v-for="model in models"
            :key="model.id"
              :class="[
                'w-full text-left px-3 py-2 rounded-lg text-[11px] transition-colors',
                currentModel === model.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]',
              ]"
              :style="currentModel === model.id ? { background: 'var(--color-primary-light)' } : {}"
            @click="currentModel = model.id; showModelSelector = false"
          >
            <div class="font-medium">{{ model.name }}</div>
            <div class="text-[10px]" style="color: var(--color-text-secondary)">{{ model.desc }}</div>
          </button>
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
        <div class="rounded-2xl px-4 py-2.5" style="background: var(--color-surface-alt)">
          <span class="inline-flex gap-1">
            <span class="w-1.5 h-1.5 rounded-full animate-bounce" style="background: var(--color-primary)"></span>
            <span class="w-1.5 h-1.5 rounded-full animate-bounce" style="background: var(--color-primary); animation-delay: 150ms"></span>
            <span class="w-1.5 h-1.5 rounded-full animate-bounce" style="background: var(--color-primary); animation-delay: 300ms"></span>
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
.overflow-y-auto::-webkit-scrollbar-thumb { background-color: var(--color-border); border-radius: 2px; }
</style>
