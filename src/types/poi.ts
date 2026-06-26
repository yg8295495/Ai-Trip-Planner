/**
 * 携程 POI 核心实体（主线数据标准）
 */
export interface CtripPOI {
  poi_id: string           // 携程原生唯一主键
  name: string
  lat: number
  lng: number
  category: string         // 13类宏观标签之一
  rating?: number          // 携程评分
  review_total?: number    // 评论总数
  cover_url?: string       // 景点封面图
  keytag?: string          // 5A / 4A / 世界遗产 等评级权重
  intro_text?: string      // 介绍图片及文案描述
  // 扩展字段
  city?: string
  zone?: string
  is_free?: boolean
  open_status?: string
  short_features?: string[]
  tags?: string[]
}

/**
 * OSM 长尾野景点实体（仅用于精细分日下的只读雷达发现）
 */
export interface OsmPOI {
  osm_id: string           // OSM 节点/路径 ID
  name: string
  lat: number
  lng: number
  primary_tag: 'tourism' | 'historic' | 'leisure'
  specific_tag?: string    // 如 camp_site, viewpoint, water
}

/**
 * 一维珍珠项链的航点定义
 */
export interface Waypoint {
  id: string               // 严格等于 CtripPOI.poi_id
  poi_details: CtripPOI    // 完整的携程数据备份
  isOvernight: boolean     // 是否在此过夜（用于分日切片）
  custom_notes?: string    // 用户自定义账本备注
}

/**
 * 空间检索请求参数
 */
export interface BoundsRect {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

export interface SearchPayload {
  bounds_list: BoundsRect[]
  category?: string
  is_route_mode?: boolean
  limit?: number
}
