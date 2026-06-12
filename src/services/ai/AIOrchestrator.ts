import type { TripParams, ConversationMessage, AIResponseEnvelope } from '@/types'
import { buildPrompt } from './PromptManager'
import { parseAIResponse } from './ResponseParser'

interface AIConfig {
  baseUrl: string
  apiKey: string
  model: string
}

function getConfig(): AIConfig {
  return {
    baseUrl: import.meta.env.VITE_AI_API_BASE_URL,
    apiKey: import.meta.env.VITE_AI_API_KEY,
    model: import.meta.env.VITE_AI_MODEL,
  }
}

export async function callAI(
  params: TripParams,
  messages: ConversationMessage[],
  userMessage: string
): Promise<AIResponseEnvelope> {
  const config = getConfig()

  if (!config.apiKey || config.apiKey === 'sk-your-key-here') {
    return generateMockResponse(params, userMessage)
  }

  const prompt = buildPrompt(params, messages, userMessage)

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    return parseAIResponse(content)
  } catch (error) {
    console.error('AI API error:', error)
    return generateMockResponse(params, userMessage)
  }
}

function generateMockResponse(
  params: TripParams,
  _userMessage: string
): AIResponseEnvelope {
  const missing: string[] = []
  if (!params.origin) missing.push('origin')
  if (!params.destination) missing.push('destination')
  if (!params.totalDays) missing.push('totalDays')

  if (missing.length > 0) {
    const questions: string[] = []
    if (!params.origin) questions.push('您计划从哪里出发？')
    if (!params.destination) questions.push('您的目的地是哪里？')
    if (!params.totalDays) questions.push('您计划旅行几天？')

    return {
      chat: questions.join('\n'),
      status: 'collecting',
      tripParamUpdates: {},
      locationUpdates: [],
      itineraryNotes: '',
      missingFields: missing,
    }
  }

  return {
    chat: `好的，我确认一下：从${params.origin!.shortName}到${params.destination!.shortName}，共${params.totalDays}天。让我来为您规划路线。`,
    status: 'planning',
    tripParamUpdates: {},
    locationUpdates: [],
    itineraryNotes: '',
    missingFields: [],
  }
}
