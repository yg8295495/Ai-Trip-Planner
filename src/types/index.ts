export interface GeocodedPlace {
  query: string
  lat: number
  lon: number
  shortName: string
  fullName: string
}

export type TravelStyleTag = 'nature' | 'culture' | 'food' | 'adventure' | 'cities' | 'relaxed'

export interface TripParams {
  origin: GeocodedPlace | null
  destination: GeocodedPlace | null
  totalDays: number | null
  departureDate: Date | null
  dailyDrivingLimitHours: number
  hotelBudget: 'budget' | 'mid' | 'luxury'
  travelStyle: TravelStyleTag[]
}

export interface Location {
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
  category: 'city' | 'scenic' | 'food' | 'nature' | 'culture' | 'hotel'
  description: string
  suggested: boolean
  selected: boolean
  dayHint: number | null
}

export interface DrivingLeg {
  fromId: string
  toId: string
  distanceKm: number
  durationHours: number
}

export interface ItineraryDay {
  dayNumber: number
  date: Date | null
  overnightLocation: Location
  stops: Location[]
  totalDriveHours: number
  totalDistanceKm: number
  isOverLimit: boolean
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
}

export interface AIResponseEnvelope {
  chat: string
  status: 'collecting' | 'planning' | 'refining'
  tripParamUpdates: Partial<TripParams>
  locationUpdates: LocationUpdate[]
  itineraryNotes: string
  missingFields: string[]
}

export interface LocationUpdate {
  action: 'add' | 'remove' | 'update'
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
  category: Location['category']
  description: string
  suggested: boolean
  selected: boolean
  dayHint: number | null
}
