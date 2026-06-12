import type { Location } from '@/types'

export const CATEGORY_COLORS: Record<Location['category'], string> = {
  city: '#3B82F6',
  scenic: '#22C55E',
  food: '#EAB308',
  nature: '#22C55E',
  culture: '#A855F7',
  hotel: '#A855F7',
}

export const CATEGORY_LABELS: Record<Location['category'], string> = {
  city: '城市',
  scenic: '景点',
  food: '美食',
  nature: '自然',
  culture: '文化',
  hotel: '住宿',
}

export const PIN_STATUS_COLORS = {
  confirmed: '#22C55E',
  suggested: '#3B82F6',
  food: '#EAB308',
  hotel: '#A855F7',
  removed: '#6B7280',
}
