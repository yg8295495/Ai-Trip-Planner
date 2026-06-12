/**
 * 行政区域查询 - 基础LBS 免费池
 * 启动时一次性预加载全国省市区到 localStorage，
 * 后续做地名联想 / autocomplete 完全走客户端匹配，0 API 调用。
 */

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'
const CACHE_KEY = 'adcode_cache_v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 天过期

export interface DistrictNode {
  adcode: string
  name: string
  level: 'country' | 'province' | 'city' | 'district' | 'street'
  // center 可能是字符串 "lng,lat"（district API 返回） 或 [lng, lat] 元组
  center?: string | [number, number] | unknown
  children?: DistrictNode[]
}

export interface DistrictFlat {
  byAdcode: Record<string, { name: string; level: string; center: [number, number] }>
  byName: Record<string, { adcode: string; name: string; level: string; center: [number, number] }[]>
  loadedAt: number
}

let flatCache: DistrictFlat | null = null
let loadingPromise: Promise<DistrictFlat> | null = null

/** 从 localStorage 读缓存 */
function readCache(): DistrictFlat | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DistrictFlat
    if (Date.now() - parsed.loadedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

/** 写缓存到 localStorage */
function writeCache(flat: DistrictFlat) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flat))
  } catch (e) {
    console.warn('District cache write failed (可能超出 localStorage 容量):', e)
  }
}

/** 调高德 district 接口 */
async function fetchDistrict(): Promise<DistrictNode[]> {
  const url = `https://restapi.amap.com/v3/config/district?keywords=中国&subdistrict=3&extensions=base&key=${AMAP_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== '1' || !data.districts?.length) {
    throw new Error('District API failed: ' + data.info)
  }
  return data.districts[0].districts as DistrictNode[]
}

/** 把任意 center 形式统一为 [lng, lat] */
function parseCenter(c: unknown): [number, number] | null {
  if (typeof c === 'string') {
    const parts = c.split(',')
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    if (!isNaN(lng) && !isNaN(lat)) return [lng, lat]
  } else if (Array.isArray(c) && c.length === 2) {
    const lng = Number(c[0])
    const lat = Number(c[1])
    if (!isNaN(lng) && !isNaN(lat)) return [lng, lat]
  }
  return null
}

/** 递归遍历所有节点，构造扁平索引 */
function flattenTree(roots: DistrictNode[]): DistrictFlat {
  const byAdcode: DistrictFlat['byAdcode'] = {}
  const byName: DistrictFlat['byName'] = {}

  const walk = (node: DistrictNode) => {
    if (node.adcode && node.center) {
      const center = parseCenter(node.center)
      if (!center) return
      const meta = { name: node.name, level: node.level, center }
      byAdcode[node.adcode] = meta
      if (!byName[node.name]) byName[node.name] = []
      byName[node.name].push({ adcode: node.adcode, ...meta })
    }
    node.children?.forEach(walk)
  }
  roots.forEach(walk)

  return { byAdcode, byName, loadedAt: Date.now() }
}

/** 加载/获取缓存（首次会网络请求） */
export async function loadDistrictCache(force = false): Promise<DistrictFlat> {
  if (!force && flatCache) return flatCache
  if (!force) {
    const cached = readCache()
    if (cached) {
      flatCache = cached
      return cached
    }
  }
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const tree = await fetchDistrict()
    const flat = flattenTree(tree)
    flatCache = flat
    writeCache(flat)
    loadingPromise = null
    return flat
  })()
  return loadingPromise
}

/** 客户端模糊匹配（支持前缀/包含） */
export function searchDistrict(query: string, limit = 10): { adcode: string; name: string; level: string; center: [number, number] }[] {
  if (!query || !flatCache) return []
  const q = query.trim()
  if (!q) return []

  const results: { adcode: string; name: string; level: string; center: [number, number]; score: number }[] = []
  const qLower = q.toLowerCase()

  for (const name in flatCache.byName) {
    if (results.length >= limit * 3) break
    const nLower = name.toLowerCase()
    let score = 0
    if (nLower === qLower) score = 100
    else if (nLower.startsWith(qLower)) score = 80
    else if (nLower.includes(qLower)) score = 50

    if (score > 0) {
      flatCache.byName[name].forEach(item => {
        results.push({ ...item, score })
      })
    }
  }

  const seen = new Set<string>()
  return results
    .sort((a, b) => b.score - a.score)
    .filter(r => {
      if (seen.has(r.adcode)) return false
      seen.add(r.adcode)
      return true
    })
    .slice(0, limit)
    .map(({ score, ...rest }) => rest)
}

/** 通过 adcode 取节点信息 */
export function getDistrictByAdcode(adcode: string) {
  return flatCache?.byAdcode[adcode] || null
}
