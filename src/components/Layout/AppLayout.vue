<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const chatWidth = ref(340)
const isDragging = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const isMobile = ref(false)

function updateLayout() {
  const w = window.innerWidth
  isMobile.value = w < 768
  if (isMobile.value) {
    chatWidth.value = w
  } else {
    const style = getComputedStyle(document.documentElement)
    chatWidth.value = parseInt(style.getPropertyValue('--chat-width')) || 340
  }
}

onMounted(() => {
  updateLayout()
  window.addEventListener('resize', updateLayout)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateLayout)
})

function onMouseDown() {
  if (isMobile.value) return
  isDragging.value = true
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const minW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-width')) || 260
  chatWidth.value = Math.max(minW, Math.min(500, x))
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
</script>

<template>
  <div ref="containerRef" class="h-screen w-screen flex overflow-hidden bg-[#F5F0E8]">
    <!-- 左侧聊天 -->
    <aside
      v-if="!isMobile"
      class="flex flex-col h-full bg-white shadow-sm overflow-hidden flex-shrink-0"
      :style="{ width: chatWidth + 'px' }"
    >
      <slot name="chat" />
    </aside>

    <!-- 拖拽分割线 -->
    <div
      v-if="!isMobile"
      class="w-1 h-full cursor-col-resize flex-shrink-0 group relative"
      :class="isDragging ? 'bg-[#C66B3D]' : 'bg-[#E8DCC7] hover:bg-[#C66B3D]'"
      @mousedown.prevent="onMouseDown"
    >
      <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-colors"
        :class="isDragging ? 'bg-white' : 'bg-[#B0A99F] group-hover:bg-white'"
      ></div>
    </div>

    <!-- 中间地图 -->
    <main class="relative h-full flex-1 bg-[#E8E3D9] overflow-hidden">
      <slot name="map" />
    </main>

    <!-- 右侧行程规划 -->
    <aside
      v-if="!isMobile"
      class="flex flex-col h-full bg-white shadow-sm overflow-hidden flex-shrink-0"
      :style="{ width: 'var(--itinerary-width)' }"
    >
      <slot name="itinerary" />
    </aside>

    <!-- 手机端底部 tab 内容区 -->
    <div v-if="isMobile" class="absolute inset-0 z-30 flex flex-col bg-white" style="top: 56px;">
      <slot name="mobile-tabs" />
    </div>
  </div>
</template>
