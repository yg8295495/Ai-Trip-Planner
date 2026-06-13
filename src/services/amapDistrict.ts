/**
 * 行政区域查询 - 基础LBS 免费池
 * 启动时一次性预加载全国省市区到 localStorage，
 * 后续做地名联想 / autocomplete 完全走客户端匹配，0 API 调用。
 */

import { AMAP_KEY } from '@/config/amap'

const CACHE_KEY = 'adcode_cache_v3'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 天过期

export interface DistrictNode {
  adcode: string
  name: string
  level: 'country' | 'province' | 'city' | 'district' | 'street'
  // center 可能是字符串 "lng,lat"（district API 返回） 或 [lng, lat] 元组
  center?: string | [number, number] | unknown
  districts?: DistrictNode[]
}

export interface DistrictItem {
  adcode: string
  name: string
  level: 'province' | 'city' | 'district' | 'street'
  center: [number, number]
  path: string  // 如 "湖南 > 长沙" 或 "湖南 > 长沙 > 开福"
  parentAdcode?: string
}

export interface DistrictFlat {
  byAdcode: Record<string, DistrictItem>
  byName: Record<string, DistrictItem[]>
  byParent: Record<string, DistrictItem[]>  // parentAdcode → children
  loadedAt: number
}

let flatCache: DistrictFlat | null = null
let loadingPromise: Promise<DistrictFlat> | null = null
const listeners = new Set<(loaded: boolean) => void>()

/** 订阅缓存加载状态 */
export function onDistrictCacheChange(cb: (loaded: boolean) => void): () => void {
  listeners.add(cb)
  cb(flatCache !== null)
  return () => listeners.delete(cb)
}

function notify(loaded: boolean) {
  listeners.forEach(cb => cb(loaded))
}

/** 从 localStorage 读缓存 */
function readCache(): DistrictFlat | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DistrictFlat
    
    // 校验数据完整性
    if (Date.now() - parsed.loadedAt > CACHE_TTL_MS) return null
    if (Object.keys(parsed.byAdcode).length < 300) return null
    
    // 校验数据结构（必须有 path 和 byParent）
    const sampleItem = Object.values(parsed.byAdcode)[0]
    if (!sampleItem || !('path' in sampleItem) || !('byParent' in parsed)) {
      console.log('缓存格式过旧，重新加载')
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    
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

/** 递归遍历所有节点，构造扁平索引（带父级路径） */
function flattenTree(roots: DistrictNode[]): DistrictFlat {
  const byAdcode: DistrictFlat['byAdcode'] = {}
  const byName: DistrictFlat['byName'] = {}
  const byParent: DistrictFlat['byParent'] = {}

  const walk = (node: DistrictNode, parentAdcode?: string, parentPath?: string) => {
    if (!node.adcode || !node.center) return
    
    const center = parseCenter(node.center)
    if (!center) return
    
    // 构建路径：父级路径 + 当前名称
    const path = parentPath ? `${parentPath} > ${node.name}` : node.name
    
    const item: DistrictItem = {
      adcode: node.adcode,
      name: node.name,
      level: node.level as DistrictItem['level'],
      center,
      path,
      parentAdcode
    }
    
    byAdcode[node.adcode] = item
    
    // byName 索引
    if (!byName[node.name]) byName[node.name] = []
    byName[node.name].push(item)
    
    // byParent 索引（跳过省级，因为省级没有父级）
    if (parentAdcode) {
      if (!byParent[parentAdcode]) byParent[parentAdcode] = []
      byParent[parentAdcode].push(item)
    }
    
    // 递归子节点
    node.districts?.forEach(child => walk(child, node.adcode, path))
  }
  
  roots.forEach(root => walk(root))

  return { byAdcode, byName, byParent, loadedAt: Date.now() }
}

/** 首次启动清理旧版本缓存 */
function cleanupOldCaches() {
  const oldKeys = ['adcode_cache_v1', 'adcode_cache_v2']
  oldKeys.forEach(k => {
    if (localStorage.getItem(k)) {
      console.log(`清理旧缓存: ${k}`)
      localStorage.removeItem(k)
    }
  })
}

/** 加载/获取缓存（首次会网络请求） */
export async function loadDistrictCache(force = false): Promise<DistrictFlat> {
  if (!force && flatCache) return flatCache
  if (!flatCache) cleanupOldCaches()
  if (!force) {
    const cached = readCache()
    if (cached) {
      flatCache = cached
      notify(true)
      return cached
    }
  }
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const tree = await fetchDistrict()
      const flat = flattenTree(tree)
      flatCache = flat
      writeCache(flat)
      return flat
    } finally {
      loadingPromise = null
      notify(flatCache !== null)
    }
  })()
  return loadingPromise
}

/** 是否已加载（同步） */
export function isDistrictCacheReady(): boolean {
  return flatCache !== null
}

/** 客户端模糊匹配（市级优先，返回带路径的结果） */
export function searchDistrict(query: string, limit = 8): DistrictItem[] {
  if (!query || !flatCache) return []
  const q = query.trim()
  if (!q) return []

  const results: (DistrictItem & { score: number })[] = []
  const qLower = q.toLowerCase()

  for (const name in flatCache.byName) {
    const nLower = name.toLowerCase()
    let score = 0
    if (nLower === qLower) score = 100
    else if (nLower.startsWith(qLower)) score = 80
    else if (nLower.includes(qLower)) score = 50

    if (score > 0) {
      flatCache.byName[name].forEach(item => {
        // 市级优先加权：city +20, district +10, province -10
        const levelBonus = item.level === 'city' ? 20 : item.level === 'district' ? 10 : item.level === 'province' ? -10 : 0
        results.push({ ...item, score: score + levelBonus })
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

/** 获取某节点的子级（本地缓存） */
export function getChildren(parentAdcode: string): DistrictItem[] {
  if (!flatCache) return []
  return flatCache.byParent[parentAdcode] || []
}

/** 按需加载乡镇数据（调高德 API，带内存缓存） */
const streetsCache = new Map<string, DistrictItem[]>()

export async function fetchStreets(districtAdcode: string): Promise<DistrictItem[]> {
  // 命中缓存直接返回
  if (streetsCache.has(districtAdcode)) {
    return streetsCache.get(districtAdcode)!
  }

  const parent = flatCache?.byAdcode[districtAdcode]
  if (!parent) throw new Error('District not found: ' + districtAdcode)

  const url = `https://restapi.amap.com/v3/config/district?keywords=${encodeURIComponent(parent.name)}&subdistrict=1&extensions=base&key=${AMAP_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  
  if (data.status !== '1' || !data.districts?.length) {
    throw new Error('Fetch streets failed: ' + data.info)
  }

  // 找到匹配的区县节点
  const target = data.districts.find((d: DistrictNode) => d.adcode === districtAdcode)
  if (!target?.districts) {
    streetsCache.set(districtAdcode, [])
    return []
  }

  const streets = target.districts.map((street: DistrictNode) => {
    const center = parseCenter(street.center)
    if (!center) return null
    return {
      adcode: street.adcode,
      name: street.name,
      level: 'street' as const,
      center,
      path: `${parent.path} > ${street.name}`,
      parentAdcode: districtAdcode
    }
  }).filter((s: DistrictItem | null): s is DistrictItem => s !== null)

  // 写入缓存
  streetsCache.set(districtAdcode, streets)
  return streets
}

/** 通过 adcode 取节点信息 */
export function getDistrictByAdcode(adcode: string) {
  return flatCache?.byAdcode[adcode] || null
}
