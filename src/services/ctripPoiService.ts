/**
 * 携程景点服务
 * 从后端 API 获取携程景点数据
 */

export interface CtripPoi {
  city: string
  name: string
  poi_id: number
  score: string
  review_count: number
  zone: string
  tags: string[]
  cover_image: string
  lat: number
  lng: number
  is_free: boolean
  short_features: string[]
  detail_url: string
}

// 携程分类标签
export const CTRIP_CATEGORIES = [
  "历史建筑", "自然山水", "主题乐园&游乐场", "亲子同乐",
  "博物馆&展馆", "地标观景", "城市漫步", "夜游观景",
  "赏花胜地", "遛娃宝藏地", "亲近动物", "园林花园", "缆车索道"
]

// Bounds矩形
export interface BoundsRect {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

// 搜索请求
export interface SearchPayload {
  bounds_list: BoundsRect[]
  category?: string
  is_route_mode?: boolean
  limit?: number
}

// 获取携程景点（旧接口，保留兼容）
export async function fetchCtripPois(
  category?: string,
  city?: string,
  limit: number = 25
): Promise<CtripPoi[]> {
  try {
    const params = new URLSearchParams()
    if (category) params.append('category', category)
    if (city) params.append('city', city)
    params.append('limit', limit.toString())

    const url = `/api/pois?${params}`
    const res = await fetch(url)
    const data = await res.json()
    return data.pois || []
  } catch (err) {
    console.error('[ctripPoiService] Fetch failed:', err)
    return []
  }
}

// 按分类获取景点（旧接口，保留兼容）
export async function fetchCtripPoisByCategory(
  category: string,
  limit: number = 25
): Promise<CtripPoi[]> {
  return fetchCtripPois(category, undefined, limit)
}

// 按Bounds搜索携程景点（新接口）
export async function searchCtripPoisByBounds(
  boundsList: BoundsRect[],
  options: { category?: string; is_route_mode?: boolean; limit?: number } = {}
): Promise<{ pois: CtripPoi[]; total: number }> {
  try {
    const payload: SearchPayload = {
      bounds_list: boundsList,
      category: options.category,
      is_route_mode: options.is_route_mode ?? false,
      limit: options.limit ?? 25,
    }

    const res = await fetch('/api/pois/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return { pois: data.pois || [], total: data.total || 0 }
  } catch (err) {
    console.error('[ctripPoiService] Search failed:', err)
    return { pois: [], total: 0 }
  }
}

// OSM长尾发现
export async function discoverOsmPois(
  minLat: number, maxLat: number, minLng: number, maxLng: number, limit: number = 15
): Promise<{ osm_pois: any[]; total: number }> {
  try {
    const params = new URLSearchParams({
      min_lat: minLat.toString(),
      max_lat: maxLat.toString(),
      min_lng: minLng.toString(),
      max_lng: maxLng.toString(),
      limit: limit.toString(),
    })
    const res = await fetch(`/api/pois/osm-discover?${params}`)
    const data = await res.json()
    return { osm_pois: data.osm_pois || [], total: data.total || 0 }
  } catch (err) {
    console.error('[ctripPoiService] OSM discover failed:', err)
    return { osm_pois: [], total: 0 }
  }
}

// 获取热门景点（旧接口，保留兼容）
export async function fetchHotCtripPois(
  limit: number = 25
): Promise<CtripPoi[]> {
  return fetchCtripPois(undefined, undefined, limit)
}
