import { useTripStore } from '@/store/tripStore'
import { useSession } from './useSession'
import { usePolling } from './usePolling'
import { readAllLines } from '@/utils/jsonl'

export function useAI() {
  const store = useTripStore()
  const session = useSession()
  const polling = usePolling()

  async function sendMessage(text: string) {
    const provider = import.meta.env.VITE_AI_PROVIDER || 'mimo'

    await session.sendMessage(text, provider)

    if (session.currentSessionPath.value) {
      polling.startPolling(session.currentSessionPath.value)
    }
  }

  async function refreshMessages() {
    if (!session.currentSessionId.value || !session.currentSessionPath.value) return

    const messages = await readAllLines(session.currentSessionPath.value)

    const lastAI = messages
      .filter(m => m.role === 'ai')
      .pop()

    if (lastAI && lastAI.text) {
      const exists = store.messages.some(m => m.text === lastAI.text)
      if (!exists) {
        polling.handleAIResponse(lastAI)
      }
    }
  }

  return {
    sendMessage,
    refreshMessages,
    isPolling: polling.isPolling,
    currentSessionId: session.currentSessionId,
  }
}
