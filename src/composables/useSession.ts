import { ref, computed } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { appendToJSONL, readAllLines, listActiveSessions, getSessionFilePath } from '@/utils/jsonl'
import type { JSONLMessage } from '@/types/session'

export function useSession() {
  const store = useTripStore()
  const currentSessionId = ref<string | null>(null)
  const sessions = ref<Awaited<ReturnType<typeof listActiveSessions>>>([])
  const isLoading = ref(false)

  const currentSessionPath = computed(() =>
    currentSessionId.value ? getSessionFilePath(currentSessionId.value) : null
  )

  async function createSession(): Promise<string> {
    const id = `session-${Date.now()}`
    currentSessionId.value = id

    const welcomeMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'system',
      text: 'Session started',
      event: 'session_started',
    }

    await appendToJSONL(getSessionFilePath(id), welcomeMessage)
    return id
  }

  async function loadSession(sessionId: string): Promise<void> {
    currentSessionId.value = sessionId
    isLoading.value = true

    try {
      const messages = await readAllLines(getSessionFilePath(sessionId))

      store.messages = messages
        .filter(m => m.role === 'user' || m.role === 'ai')
        .map(m => ({
          id: `msg_${m.ts}`,
          role: m.role === 'ai' ? 'assistant' : 'user',
          text: m.text || '',
          timestamp: new Date(m.ts),
        }))
    } finally {
      isLoading.value = false
    }
  }

  async function sendMessage(text: string, provider: string = 'mimo'): Promise<void> {
    if (!currentSessionId.value) {
      await createSession()
    }

    const userMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'user',
      text,
      provider,
    }

    await appendToJSONL(currentSessionPath.value!, userMessage)

    store.addMessage({
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    })
  }

  async function closeSession(): Promise<void> {
    if (!currentSessionId.value) return

    const closeMessage: JSONLMessage = {
      ts: new Date().toISOString(),
      role: 'system',
      event: 'session_closed',
    }

    await appendToJSONL(currentSessionPath.value!, closeMessage)
    currentSessionId.value = null
  }

  async function refreshSessions(): Promise<void> {
    sessions.value = await listActiveSessions()
  }

  return {
    currentSessionId,
    currentSessionPath,
    sessions,
    isLoading,
    createSession,
    loadSession,
    sendMessage,
    closeSession,
    refreshSessions,
  }
}
