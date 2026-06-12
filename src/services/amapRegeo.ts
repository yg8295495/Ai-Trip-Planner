/**
 * 逆地理编码 - 基础LBS 免费池
 * 用途：
 *  1. 地图点击 -> 拿点击点的 POI/AOI 列表（替代"周边搜索"消耗 5,000 共享池）
 *  2. GPS 定位后 -> 拿完整地址
 *  3. 路线经过某地时 -> 拿该地地址信息
 *
 * extensions=all&radius=3000&poitype=多typecode 可一次拿景点/酒店/美食
 */

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

// POI 大类 typecode（高德 POI 分类码）
// https://lbs.amap.com/api/webservice/download
export const POI_TYPECODES = {
  scenic: '110000',     // 风景名胜
  food: '050000',       // 餐饮服务（实际是 050000 不是 100000，按高德标准）
  hotel: '100000',      // 住宿服务
  shopping: '060000',   // 购物
  transport: '150000',  // 交通
  culture: '140000',    // 科教文化
} as const

export type CategoryKey = keyof typeof POI_TYPECODES

export interface RegeoPoi {
  id: string
  name: string
  type: string
  address: string
  location: string         // "lng,lat"
  distance: number
  direction: string
  businessarea?: string
  category?: CategoryKey   // 内部打标
}

export interface RegeoAoi {
  id: string
  name: string
  adcode: string
  location: string
  area: number
  distance: number
  type: string
}

export interface RegeoAddress {
  formatted: string
  province: string
  city: string
  district: string
  township: string
  adcode: string
  citycode: string
  street?: string
  number?: string
}

export interface RegeoResult {
  address: RegeoAddress
  pois: RegeoPoi[]
  aois: RegeoAoi[]
}

/** 单点逆地理：lng,lat -> 完整地址 + 附近 POI + AOI */
export async function regeo(
  lng: number,
  lat: number,
  options: {
    radius?: number          // POI 搜索半径，默认 1000m，最大 3000m
    categories?: CategoryKey[]  // 要拿哪些分类，默认 scenic
    limit?: number           // 每分类最多返回多少
  } = {}
): Promise<RegeoResult | null> {
  const { radius = 1000, categories = ['scenic'], limit = 5 } = options
  const poitype = categories.map(c => POI_TYPECODES[c]).join('|')

  const url = `https://restapi.amap.com/v3/geocode/regeo?` +
    `location=${lng},${lat}&extensions=all&radius=${radius}&` +
    `poitype=${poitype}&key=${AMAP_KEY}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== '1' || !data.regeocode) return null

    const re = data.regeocode
    const ac = re.addressComponent || {}

    const address: RegeoAddress = {
      formatted: re.formatted_address,
      province: ac.province || '',
      city: ac.city || ac.province || '',
      district: ac.district || '',
      township: ac.township || '',
      adcode: ac.adcode || '',
      citycode: ac.citycode || '',
      street: ac.streetNumber?.street,
      number: ac.streetNumber?.number,
    }

    // 给每个 POI 打内部 category 标
    const pois: RegeoPoi[] = (re.pois || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      address: p.address,
      location: p.location,
      distance: Number(p.distance) || 0,
      direction: p.direction,
      businessarea: p.businessarea,
      category: inferCategory(p.type, categories),
    }))

    const aois: RegeoAoi[] = (re.aois || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      adcode: a.adcode,
      location: a.location,
      area: Number(a.area) || 0,
      distance: Number(a.distance) || 0,
      type: a.type,
    }))

    return { address, pois: pois.slice(0, limit * categories.length), aois }
  } catch (e) {
    console.error('regeo failed:', e)
    return null
  }
}

/** 从 POI 的 type 字段推断内部分类 */
function inferCategory(type: string, defaults: CategoryKey[]): CategoryKey {
  if (!type) return defaults[0]
  if (type.includes('风景名胜') || type.includes('景区') || type.includes('公园')) return 'scenic'
  if (type.includes('餐饮') || type.includes('美食') || type.includes('餐厅')) return 'food'
  if (type.includes('住宿') || type.includes('酒店') || type.includes('宾馆')) return 'hotel'
  if (type.includes('购物') || type.includes('商场')) return 'shopping'
  if (type.includes('交通') || type.includes('车站') || type.includes('机场')) return 'transport'
  if (type.includes('文化') || type.includes('博物馆') || type.includes('科教')) return 'culture'
  return defaults[0]
}

/** 拿最近的一个 POI（AOI 优先） */
export function pickNearestPoi(result: RegeoResult): RegeoPoi | RegeoAoi | null {
  if (result.aois.length > 0) {
    return result.aois.sort((a, b) => a.distance - b.distance)[0]
  }
  if (result.pois.length > 0) {
    return result.pois.sort((a, b) => a.distance - b.distance)[0]
  }
  return null
}
