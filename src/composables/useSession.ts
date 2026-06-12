import { ref, computed, onMounted } from 'vue'
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

  // 自动加载最近的会话
  onMounted(async () => {
    await refreshSessions()
    if (sessions.value.length > 0) {
      // 按最后修改时间排序，加载最新的
      const sorted = [...sessions.value].sort((a, b) => b.lastModified - a.lastModified)
      const latest = sorted[0]
      await loadSession(latest.id)
    }
  })

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

      // 恢复 tripParamUpdates 到 store
      const lastAiMsg = messages
        .filter(m => m.role === 'ai' && m.envelope?.tripParamUpdates)
        .pop()

      if (lastAiMsg?.envelope?.tripParamUpdates) {
        const updates = lastAiMsg.envelope.tripParamUpdates
        if (updates.origin) store.params.origin = updates.origin as any
        if (updates.destination) store.params.destination = updates.destination as any
        if (updates.totalDays) store.params.totalDays = updates.totalDays as number
        if (updates.dailyDrivingLimitHours) store.params.dailyDrivingLimitHours = updates.dailyDrivingLimitHours as number
        if (updates.hotelBudget) store.params.hotelBudget = updates.hotelBudget as any
        if (updates.travelStyle) store.params.travelStyle = updates.travelStyle as any
      }

      // 恢复 locationUpdates 到 store
      const locationMsgs = messages
        .filter(m => m.role === 'ai' && m.envelope?.locationUpdates?.length)
        .flatMap(m => m.envelope!.locationUpdates!)

      locationMsgs.forEach((loc: any) => {
        if (loc.action === 'add') {
          store.addLocation({
            id: loc.id,
            name: loc.name,
            shortName: loc.shortName,
            lat: loc.lat,
            lon: loc.lon,
            category: loc.category,
            description: loc.description,
            suggested: loc.suggested,
            selected: loc.selected,
            dayHint: loc.dayHint,
          })
        }
      })
    } finally {
      isLoading.value = false
    }
  }

  async function sendMessage(text: string, provider: string = 'codebuddy'): Promise<void> {
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
