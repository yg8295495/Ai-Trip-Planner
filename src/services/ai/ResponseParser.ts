import type { AIResponseEnvelope, TripParams, LocationUpdate } from '@/types'

const DEFAULT_RESPONSE: AIResponseEnvelope = {
  chat: '抱歉，我遇到了一些问题。请再试一次。',
  status: 'collecting',
  tripParamUpdates: {},
  locationUpdates: [],
  itineraryNotes: '',
  missingFields: ['origin', 'destination', 'totalDays'],
}

export function parseAIResponse(raw: string): AIResponseEnvelope {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { ...DEFAULT_RESPONSE, chat: raw }
    }

    const parsed = JSON.parse(jsonMatch[0])

    const chat = typeof parsed.chat === 'string' ? parsed.chat : raw
    const status = isValidStatus(parsed.status) ? parsed.status : 'collecting'
    const tripParamUpdates = sanitizeTripParamUpdates(parsed.tripParamUpdates)
    const locationUpdates = sanitizeLocationUpdates(parsed.locationUpdates)
    const itineraryNotes = typeof parsed.itineraryNotes === 'string' ? parsed.itineraryNotes : ''
    const missingFields = Array.isArray(parsed.missingFields) ? parsed.missingFields : []

    return {
      chat,
      status,
      tripParamUpdates,
      locationUpdates,
      itineraryNotes,
      missingFields,
    }
  } catch {
    return { ...DEFAULT_RESPONSE, chat: raw }
  }
}

function isValidStatus(status: unknown): status is AIResponseEnvelope['status'] {
  return status === 'collecting' || status === 'planning' || status === 'refining'
}

function sanitizeTripParamUpdates(raw: unknown): Partial<TripParams> {
  if (!raw || typeof raw !== 'object') return {}

  const updates: Partial<TripParams> = {}
  const data = raw as Record<string, unknown>

  if (typeof data.origin === 'string') updates.origin = data.origin as unknown as TripParams['origin']
  if (typeof data.destination === 'string') updates.destination = data.destination as unknown as TripParams['destination']
  if (typeof data.totalDays === 'number' && data.totalDays > 0) updates.totalDays = data.totalDays
  if (typeof data.dailyDrivingLimitHours === 'number' && data.dailyDrivingLimitHours > 0) {
    updates.dailyDrivingLimitHours = data.dailyDrivingLimitHours
  }
  if (data.hotelBudget === 'budget' || data.hotelBudget === 'mid' || data.hotelBudget === 'luxury') {
    updates.hotelBudget = data.hotelBudget
  }
  if (Array.isArray(data.travelStyle)) {
    updates.travelStyle = data.travelStyle.filter((s): s is TripParams['travelStyle'][number] =>
      ['nature', 'culture', 'food', 'adventure', 'cities', 'relaxed'].includes(s)
    )
  }

  return updates
}

function sanitizeLocationUpdates(raw: unknown): LocationUpdate[] {
  if (!Array.isArray(raw)) return []

  return raw.filter((item): item is LocationUpdate => {
    if (!item || typeof item !== 'object') return false
    const loc = item as Record<string, unknown>
    return (
      typeof loc.id === 'string' &&
      typeof loc.name === 'string' &&
      typeof loc.lat === 'number' &&
      typeof loc.lon === 'number'
    )
  })
}
