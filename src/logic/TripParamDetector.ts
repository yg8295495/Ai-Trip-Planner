import type { TripParams, GeocodedPlace } from '@/types'

interface DetectedParams {
  origin?: string
  destination?: string
  totalDays?: number
}

export function detectParamsFromText(text: string): DetectedParams {
  const result: DetectedParams = {}

  const originPatterns = [
    /从(.+?)(?:出发|到|去|→)/,
    /出发[地自]?(?:是|为|：|:)\s*(.+?)(?:[，,。\n]|$)/,
    /起点[是为：:]\s*(.+?)(?:[，,。\n]|$)/,
  ]

  const destPatterns = [
    /到(.+?)(?:[，,。\n]|$)/,
    /去(.+?)(?:[，,。\n]|$)/,
    /目的[地](?:是|为|：|:)\s*(.+?)(?:[，,。\n]|$)/,
    /终点[是为：:]\s*(.+?)(?:[，,。\n]|$)/,
  ]

  const dayPatterns = [
    /(\d+)\s*天/,
    /共\s*(\d+)\s*天/,
    /(\d+)\s*日/,
  ]

  for (const pattern of originPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.origin = match[1].trim()
      break
    }
  }

  for (const pattern of destPatterns) {
    const match = text.match(pattern)
    if (match) {
      result.destination = match[1].trim()
      break
    }
  }

  for (const pattern of dayPatterns) {
    const match = text.match(pattern)
    if (match) {
      const days = parseInt(match[1], 10)
      if (days > 0 && days <= 30) {
        result.totalDays = days
        break
      }
    }
  }

  return result
}

export function createGeocodedPlace(name: string): GeocodedPlace {
  return {
    query: name,
    lat: 0,
    lon: 0,
    shortName: name,
    fullName: name,
  }
}
