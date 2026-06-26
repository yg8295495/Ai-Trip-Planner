import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ConversationMessage, GeocodedPlace } from '@/types'

export const useChatStore = defineStore('chat', () => {
  // 聊天消息
  const messages = ref<ConversationMessage[]>([])

  // 行程参数（起终点、天数等）
  const params = ref<{
    origin: GeocodedPlace | null
    destination: GeocodedPlace | null
    totalDays: number | null
    dailyDrivingLimitHours: number
    hotelBudget: number | null
    travelStyle: string[]
  }>({
    origin: null,
    destination: null,
    totalDays: null,
    dailyDrivingLimitHours: 8,
    hotelBudget: null,
    travelStyle: []
  })

  function addMessage(msg: ConversationMessage) {
    messages.value.push(msg)
  }

  function clearMessages() {
    messages.value = []
  }

  return {
    messages,
    params,
    addMessage,
    clearMessages
  }
})
