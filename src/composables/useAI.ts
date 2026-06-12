import { useTripStore } from '@/store/tripStore'
import { callAI } from '@/services/ai/AIOrchestrator'

export function useAI() {
  const store = useTripStore()

  async function sendMessage(text: string) {
    store.addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    })

    store.isLoading = true

    try {
      const response = await callAI(
        store.params,
        store.messages,
        text
      )

      store.addMessage({
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        text: response.chat,
        timestamp: new Date(),
      })

      if (response.tripParamUpdates.origin) {
        store.params.origin = response.tripParamUpdates.origin
      }
      if (response.tripParamUpdates.destination) {
        store.params.destination = response.tripParamUpdates.destination
      }
      if (response.tripParamUpdates.totalDays) {
        store.params.totalDays = response.tripParamUpdates.totalDays
      }
      if (response.tripParamUpdates.dailyDrivingLimitHours) {
        store.params.dailyDrivingLimitHours = response.tripParamUpdates.dailyDrivingLimitHours
      }
      if (response.tripParamUpdates.hotelBudget) {
        store.params.hotelBudget = response.tripParamUpdates.hotelBudget
      }
      if (response.tripParamUpdates.travelStyle) {
        store.params.travelStyle = response.tripParamUpdates.travelStyle
      }

      if (response.status) {
        store.planningStatus = response.status
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      store.addMessage({
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        text: '抱歉，发送消息时出错了。请再试一次。',
        timestamp: new Date(),
      })
    } finally {
      store.isLoading = false
    }
  }

  return { sendMessage }
}
