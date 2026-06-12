import type { PoiInfo } from '@/store/tripStore'

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

// 多边形搜索：1次调用，搜全路线
export async function searchPoisByPolygon(
  polygon: number[][],
  types: string = '110000',
  pageSize: number = 25
): Promise<PoiInfo[]> {
  try {
    const coords = polygon.map(([lat, lon]) => `${lon},${lat}`).join('|')
    const url = `https://restapi.amap.com/v5/place/polygon?polygon=${coords}&types=${types}&show_fields=photos,business&key=${AMAP_KEY}&page_size=${pageSize}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.status === '1' && data.pois) {
      return data.pois.map((poi: any) => ({
        id: poi.id,
        name: poi.name,
        type: poi.type || '',
        typecode: poi.typecode || '',
        address: poi.address || '',
        location: poi.location || '',
        cityname: poi.cityname || '',
        adname: poi.adname || '',
        rating: poi.rating || '',
        cost: poi.cost || '',
        photos: poi.photos || [],
        tel: poi.tel || '',
        tag: poi.tag || '',
      }))
    }
    return []
  } catch (err) {
    console.error('Polygon search failed:', err)
    return []
  }
}

// 地理编码：文本 → 坐标
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; adcode?: string; level?: string } | null> {
  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === '1' && data.geocodes?.[0]) {
      const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
      return { lat, lon, adcode: data.geocodes[0].adcode, level: data.geocodes[0].level }
    }
  } catch (err) {
    console.error('Geocode failed:', err)
  }
  return null
}

// 生成路线走廊多边形
export function generateCorridorPolygon(
  polyline: number[][],
  offsetKm: number = 30,
  sampleInterval: number = 50
): number[][] {
  if (polyline.length < 2) return []

  // 采样
  const sampled = [polyline[0]]
  let acc = 0
  for (let i = 1; i < polyline.length; i++) {
    const dist = haversine(polyline[i-1][0], polyline[i-1][1], polyline[i][0], polyline[i][1])
    acc += dist
    if (acc >= sampleInterval * 1000) {
      sampled.push(polyline[i])
      acc = 0
    }
  }
  sampled.push(polyline[polyline.length - 1])

  // 计算偏移
  const left: number[][] = []
  const right: number[][] = []

  for (let i = 0; i < sampled.length; i++) {
    let bearing: number
    if (i === 0) {
      bearing = calculateBearing(sampled[0][0], sampled[0][1], sampled[1][0], sampled[1][1])
    } else if (i === sampled.length - 1) {
      bearing = calculateBearing(sampled[i-1][0], sampled[i-1][1], sampled[i][0], sampled[i][1])
    } else {
      bearing = calculateBearing(sampled[i-1][0], sampled[i-1][1], sampled[i+1][0], sampled[i+1][1])
    }

    const [ll, lo] = offsetPoint(sampled[i][0], sampled[i][1], bearing + 90, offsetKm)
    const [rl, ro] = offsetPoint(sampled[i][0], sampled[i][1], bearing - 90, offsetKm)
    left.push([ll, lo])
    right.push([rl, ro])
  }

  return [...left, ...right.reverse()]
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dphi = ((lat2 - lat1) * Math.PI) / 180
  const dlambda = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const x = Math.sin(dl) * Math.cos(phi2)
  const y = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dl)
  return (Math.atan2(x, y) * 180) / Math.PI
}

function offsetPoint(lat: number, lon: number, bearing: number, distanceKm: number): [number, number] {
  const R = 6371
  const d = distanceKm / R
  const phi1 = (lat * Math.PI) / 180
  const lam1 = ((lon * Math.PI) / 180)
  const brng = (bearing * Math.PI) / 180

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(brng))
  const lam2 = lam1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(phi1), Math.cos(d) - Math.sin(phi1) * Math.sin(phi2))

  return [(phi2 * 180) / Math.PI, (lam2 * 180) / Math.PI]
}
