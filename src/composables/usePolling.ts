import { ref, onUnmounted } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { readLastLine } from '@/utils/jsonl'
import type { JSONLMessage } from '@/types/session'

const POLL_INTERVAL = parseInt(import.meta.env.VITE_POLL_INTERVAL || '1000')
const AI_TIMEOUT = parseInt(import.meta.env.VITE_AI_TIMEOUT || '30000')

export function usePolling() {
  const store = useTripStore()
  const isPolling = ref(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let lastMessageCount = 0

  function startPolling(sessionPath: string) {
    if (isPolling.value) return

    isPolling.value = true
    lastMessageCount = store.messages.length

    timeoutTimer = setTimeout(() => {
      stopPolling()
      store.addMessage({
        id: `msg_${Date.now()}_timeout`,
        role: 'assistant',
        text: 'AI 暂时无法响应，请稍后重试或手动刷新。',
        timestamp: new Date(),
      })
    }, AI_TIMEOUT)

    poll(sessionPath)
  }

  function poll(sessionPath: string) {
    if (!isPolling.value) return

    readLastLine(sessionPath).then((lastLine) => {
      if (!isPolling.value) return

      if (lastLine && lastLine.role === 'ai' && store.messages.length === lastMessageCount) {
        handleAIResponse(lastLine)
        stopPolling()
        return
      }

      pollTimer = setTimeout(() => poll(sessionPath), POLL_INTERVAL)
    })
  }

  function handleAIResponse(message: JSONLMessage) {
    if (!message.text) return

    store.addMessage({
      id: `msg_${message.ts}`,
      role: 'assistant',
      text: message.text,
      timestamp: new Date(message.ts),
    })

    if (message.envelope) {
      if (message.envelope.status) {
        store.planningStatus = message.envelope.status
      }

      const updates = message.envelope.tripParamUpdates
      if (updates) {
        if (updates.origin) store.params.origin = updates.origin as typeof store.params.origin
        if (updates.destination) store.params.destination = updates.destination as typeof store.params.destination
        if (updates.totalDays) store.params.totalDays = updates.totalDays as number
        if (updates.dailyDrivingLimitHours) {
          store.params.dailyDrivingLimitHours = updates.dailyDrivingLimitHours as number
        }
        if (updates.hotelBudget) store.params.hotelBudget = updates.hotelBudget as typeof store.params.hotelBudget
        if (updates.travelStyle) store.params.travelStyle = updates.travelStyle as typeof store.params.travelStyle
      }
    }
  }

  function stopPolling() {
    isPolling.value = false

    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }

    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  onUnmounted(() => {
    stopPolling()
  })

  return {
    isPolling,
    startPolling,
    stopPolling,
    handleAIResponse,
  }
}
