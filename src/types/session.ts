export interface JSONLMessage {
  ts: string
  role: 'user' | 'ai' | 'system'
  text?: string
  envelope?: {
    status?: 'collecting' | 'planning' | 'refining'
    tripParamUpdates?: Record<string, unknown>
    locationUpdates?: unknown[]
    itineraryNotes?: string
    missingFields?: string[]
  }
  provider?: string
  event?: 'session_started' | 'session_closed' | 'auto_archived'
}

export interface SessionInfo {
  id: string
  filePath: string
  lastModified: number
  messageCount: number
}
