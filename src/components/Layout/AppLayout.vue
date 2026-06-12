<script setup lang="ts">
</script>

<template>
  <div class="h-screen w-screen grid grid-cols-[340px_1fr_380px] grid-rows-[1fr] overflow-hidden bg-gray-50">
    <!-- 左侧聊天 -->
    <aside class="flex flex-col h-full bg-white shadow-sm overflow-hidden">
      <slot name="chat" />
    </aside>

    <!-- 中间地图 -->
    <main class="relative h-full bg-gray-100 overflow-hidden">
      <slot name="map" />
    </main>

    <!-- 右侧行程/POI -->
    <aside class="flex flex-col h-full bg-white shadow-sm overflow-hidden">
      <slot name="itinerary" />
    </aside>
  </div>
</template>
