<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const chatWidth = ref(340)
const isDragging = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const MIN_CHAT = 260
const MAX_CHAT = 500

function onMouseDown() {
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
  chatWidth.value = Math.max(MIN_CHAT, Math.min(MAX_CHAT, x))
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div ref="containerRef" class="h-screen w-screen flex overflow-hidden bg-[#F5F0E8]">
    <!-- 左侧聊天 -->
    <aside
      class="flex flex-col h-full bg-white shadow-sm overflow-hidden flex-shrink-0"
      :style="{ width: chatWidth + 'px' }"
    >
      <slot name="chat" />
    </aside>

    <!-- 拖拽分割线 -->
    <div
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

    <!-- 右侧行程规划（固定） -->
    <aside class="flex flex-col h-full bg-white shadow-sm overflow-hidden flex-shrink-0 w-[260px]">
      <slot name="itinerary" />
    </aside>
  </div>
</template>
