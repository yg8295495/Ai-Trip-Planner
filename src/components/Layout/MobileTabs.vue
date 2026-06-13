<script setup lang="ts">
import { ref } from 'vue'
import ItineraryStrip from '../ItineraryStrip/ItineraryStrip.vue'
import ChatPanel from '../ChatPanel/ChatPanel.vue'

const activeTab = ref<'trip' | 'map' | 'chat'>('trip')
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tab 内容 -->
    <div class="flex-1 overflow-hidden">
      <div v-show="activeTab === 'trip'" class="h-full overflow-y-auto">
        <ItineraryStrip />
      </div>
      <div v-show="activeTab === 'chat'" class="h-full">
        <ChatPanel />
      </div>
      <!-- 地图 tab 不渲染在这里，地图始终在背景 -->
    </div>

    <!-- 底部 Tab 栏 -->
    <div class="flex-shrink-0 flex border-t border-[#E8DCC7] bg-white">
      <button
        v-for="tab in ([
          { key: 'trip', label: '行程', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { key: 'map', label: '地图', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
          { key: 'chat', label: '对话', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
        ] as const)"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
        :class="activeTab === tab.key ? 'text-[#C66B3D]' : 'text-[#8B8578]'"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path :d="tab.icon"/>
        </svg>
        <span class="text-[10px] font-medium">{{ tab.label }}</span>
      </button>
    </div>
  </div>
</template>
