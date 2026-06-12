import type { JSONLMessage, SessionInfo } from '@/types/session'

const SESSIONS_DIR = import.meta.env.VITE_SESSIONS_DIR || 'sessions'

export function getActiveSessionsPath(): string {
  return `${SESSIONS_DIR}/active`
}

export function getSessionFilePath(sessionId: string): string {
  return `${SESSIONS_DIR}/active/${sessionId}.jsonl`
}

export function getArchivePath(): string {
  return `${SESSIONS_DIR}/archive`
}

export async function appendToJSONL(filePath: string, message: JSONLMessage): Promise<void> {
  const line = JSON.stringify(message) + '\n'

  try {
    const response = await fetch('/api/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, line }),
    })

    if (!response.ok) {
      throw new Error('Failed to append to JSONL')
    }
  } catch (error) {
    console.error('JSONL append error:', error)
    throw error
  }
}

export async function readLastLine(filePath: string): Promise<JSONLMessage | null> {
  try {
    const response = await fetch(`/api/last-line?path=${encodeURIComponent(filePath)}`)

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.line ? JSON.parse(data.line) : null
  } catch {
    return null
  }
}

export async function readAllLines(filePath: string): Promise<JSONLMessage[]> {
  try {
    const response = await fetch(`/api/read?path=${encodeURIComponent(filePath)}`)

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data.lines.map((line: string) => JSON.parse(line))
  } catch {
    return []
  }
}

export async function listActiveSessions(): Promise<SessionInfo[]> {
  try {
    const response = await fetch('/api/sessions/active')

    if (!response.ok) {
      return []
    }

    return await response.json()
  } catch {
    return []
  }
}
