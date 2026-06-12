<script setup lang="ts">
</script>

<template>
  <div class="h-screen w-screen grid grid-cols-[320px_1fr_360px] grid-rows-[1fr] overflow-hidden bg-gray-50">
    <aside class="flex flex-col border-r border-gray-200 bg-white">
      <slot name="chat" />
    </aside>
    <main class="relative">
      <slot name="map" />
    </main>
    <aside class="flex flex-col border-l border-gray-200 bg-white">
      <slot name="itinerary" />
    </aside>
  </div>
</template>
