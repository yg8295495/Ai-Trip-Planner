const STORAGE_PREFIX = 'session_'

export interface SessionData {
  id: string
  origin: string
  destination: string
  createdAt: string
  messages: any[]
  params: any
  locations: any[]
}

function generateSessionId(origin: string, destination: string): string {
  const date = new Date()
  const dateStr = `${date.getMonth() + 1}-${date.getDate()}`
  const rand = Math.random().toString(36).substring(2, 6)
  return `${origin}-${destination}-${dateStr}-${rand}`
}

export function createSession(origin: string, destination: string): string {
  const id = generateSessionId(origin, destination)
  const session: SessionData = {
    id,
    origin,
    destination,
    createdAt: new Date().toISOString(),
    messages: [],
    params: {},
    locations: [],
  }
  localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(session))
  return id
}

export function loadSession(id: string): SessionData | null {
  const data = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
  if (!data) return null
  try {
    return JSON.parse(data) as SessionData
  } catch {
    return null
  }
}

export function refreshSessions(): SessionData[] {
  const sessions: SessionData[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!)
        sessions.push(data)
      } catch {}
    }
  }
  return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function deleteSession(id: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
}
