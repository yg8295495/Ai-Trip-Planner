import type { JSONLMessage } from '@/types/session'

export async function chatWithAI(
  user_message: string,
  provider: string,
  chat_history: JSONLMessage[],
  trip_data: any
): Promise<any> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_message,
      provider,
      chat_history,
      trip_data,
    }),
  })

  if (!response.ok) {
    throw new Error('AI request failed')
  }

  return await response.json()
}
