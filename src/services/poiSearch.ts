import type { PoiInfo } from '@/store/tripStore'

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export async function searchPoisByCity(
  cityName: string,
  types: string = '110000', // 景点类型
  pageSize: number = 10
): Promise<PoiInfo[]> {
  try {
    const url = `https://restapi.amap.com/v5/place/text?keywords=&types=${types}&region=${cityName}&city_limit=true&show_fields=photos,business&key=${AMAP_KEY}&page_size=${pageSize}`
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
    console.error(`Search POIs in ${cityName} failed:`, err)
    return []
  }
}

export async function searchPoisByCities(
  cities: { code: string; name: string }[],
  types: string = '110000',
  pageSize: number = 10
): Promise<Map<string, PoiInfo[]>> {
  const result = new Map<string, PoiInfo[]>()

  for (const city of cities) {
    const pois = await searchPoisByCity(city.name, types, pageSize)
    if (pois.length > 0) {
      result.set(city.name, pois)
    }
    // 避免请求过快
    await new Promise((r) => setTimeout(r, 100))
  }

  return result
}

export async function getPoiDetail(poiId: string): Promise<PoiInfo | null> {
  try {
    const url = `https://restapi.amap.com/v5/place/detail?id=${poiId}&show_fields=photos,business&key=${AMAP_KEY}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.status === '1' && data.pois?.[0]) {
      const poi = data.pois[0]
      return {
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
      }
    }

    return null
  } catch (err) {
    console.error(`Get POI detail failed:`, err)
    return null
  }
}

export const POI_TYPES = {
  scenic: '110000', // 风景名胜
  food: '050000',   // 餐饮服务
  hotel: '100000',  // 住宿服务
  shopping: '060000', // 购物服务
  all: '110000|050000|100000', // 景点+美食+酒店
}
