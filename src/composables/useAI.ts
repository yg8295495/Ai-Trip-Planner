import { useChatStore } from '@/stores/chatStore'
import { ref } from 'vue'

export function useAI() {
  const store = useChatStore()
  const isPolling = ref(false)
  const currentSessionId = ref<string | null>(null)

  async function sendMessage(text: string) {
    const provider = import.meta.env.VITE_AI_PROVIDER || 'mimo'
    
    // 添加用户消息到chatStore
    store.addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date()
    })

    try {
      // 直接调用后端API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          provider,
          session_id: currentSessionId.value
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      
      // 更新session_id
      if (data.session_id) {
        currentSessionId.value = data.session_id
      }

      // 添加AI回复到chatStore
      if (data.reply) {
        store.addMessage({
          id: `msg_${Date.now()}_ai`,
          role: 'assistant',
          text: data.reply,
          timestamp: new Date()
        })
      }
    } catch (error) {
      console.error('AI请求失败:', error)
      // 添加错误消息
      store.addMessage({
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        text: '抱歉，请求失败，请重试。',
        timestamp: new Date()
      })
    }
  }

  function refreshMessages() {
    // 新架构下不需要轮询，消息已直接更新到store
  }

  return {
    sendMessage,
    refreshMessages,
    isPolling,
    currentSessionId
  }
}