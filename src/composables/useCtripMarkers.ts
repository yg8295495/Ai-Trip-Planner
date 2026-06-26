/**
 * CtripMarkerManager - 携程景点Marker管理器（重构版）
 * 
 * 职责：
 * 1. 管理携程候选POI的Marker生命周期
 * 2. 管理OSM长尾POI的Marker生命周期
 * 3. 响应式监听Store变化，自动重绘
 * 4. 管理InfoWindow交互
 */

import { watch, type WatchStopHandle } from 'vue'
import type { CtripPOI, OsmPOI } from '@/types/poi'

// 13类分类颜色映射
const CATEGORY_COLORS: Record<string, string> = {
  '历史建筑': '#8B4513',
  '自然山水': '#228B22',
  '主题乐园&游乐场': '#FF6B35',
  '亲子同乐': '#FFB6C1',
  '博物馆&展馆': '#4169E1',
  '地标观景': '#FFD700',
  '城市漫步': '#9370DB',
  '夜游观景': '#191970',
  '赏花胜地': '#FF69B4',
  '遛娃宝藏地': '#FFA500',
  '亲近动物': '#8FBC8F',
  '园林花园': '#3CB371',
  '缆车索道': '#708090'
}

export class CtripMarkerManager {
  private map: any
  private ctripMarkersMap = new Map<string, any>()
  private osmMarkersMap = new Map<string, any>()
  private infoWindow: any = null
  private watchers: WatchStopHandle[] = []

  constructor(mapInstance: any) {
    this.map = mapInstance
  }

  /**
   * 渲染携程候选Marker（增量更新，支持蒸发模式）
   */
  public renderCtripMarkers(
    pois: CtripPOI[], 
    isSelectedOnly: boolean, 
    routeWaypointIds: string[]
  ) {
    const newPoiIds = new Set(pois.map(p => p.poi_id))
    
    // 清理已被过滤掉的旧Marker
    for (const [id, marker] of this.ctripMarkersMap.entries()) {
      if (!newPoiIds.has(id)) {
        marker.setMap(null)
        this.ctripMarkersMap.delete(id)
      }
    }

    // 增量绘制或更新
    pois.forEach((poi) => {
      const isAddedToRoute = routeWaypointIds.includes(poi.poi_id)
      const shouldBeVisible = !isSelectedOnly || isAddedToRoute

      let marker = this.ctripMarkersMap.get(poi.poi_id)
      
      if (!marker) {
        marker = new (window as any).AMap.Marker({
          position: [poi.lng, poi.lat],
          title: poi.name,
          content: this.createCtripMarkerDOM(poi, isAddedToRoute),
          offset: new (window as any).AMap.Pixel(-12, -12),
          extData: { type: 'ctrip', poi }
        })
        
        marker.on('click', () => this.openCtripInfoWindow(poi))
        this.ctripMarkersMap.set(poi.poi_id, marker)
      } else {
        marker.setContent(this.createCtripMarkerDOM(poi, isAddedToRoute))
      }

      marker.setMap(shouldBeVisible ? this.map : null)
    })
  }

  /**
   * 渲染OSM长尾Marker
   */
  public renderOsmMarkers(osmPois: OsmPOI[]) {
    this.osmMarkersMap.forEach(m => m.setMap(null))
    this.osmMarkersMap.clear()

    osmPois.forEach((osmPoi) => {
      const marker = new (window as any).AMap.Marker({
        position: [osmPoi.lng, osmPoi.lat],
        title: osmPoi.name,
        content: this.createOsmMarkerDOM(osmPoi),
        offset: new (window as any).AMap.Pixel(-8, -8),
        extData: { type: 'osm', poi: osmPoi }
      })
      
      marker.on('click', () => this.openOsmInfoWindow(osmPoi))
      this.osmMarkersMap.set(osmPoi.osm_id, marker)
    })
  }

  /**
   * 初始化响应式监听
   */
  public initReactiveBridge(poiStore: any, routeStore: any) {
    // 监听筛选后的携程候选集变化
    const w1 = watch(
      () => [poiStore.filteredPois, poiStore.isSelectedOnly, routeStore.waypoints],
      () => {
        const waypointIds = routeStore.waypoints.map((w: any) => w.id)
        this.renderCtripMarkers(poiStore.filteredPois, poiStore.isSelectedOnly, waypointIds)
      },
      { deep: true, immediate: true }
    )

    // 监听OSM长尾集变化
    const w2 = watch(
      () => poiStore.osmPois,
      (newOsmPois) => {
        this.renderOsmMarkers(newOsmPois)
      },
      { deep: true }
    )

    this.watchers.push(w1, w2)
  }

  /**
   * 自适应视窗
   */
  public fitView() {
    const allMarkers = [
      ...this.ctripMarkersMap.values(),
      ...this.osmMarkersMap.values()
    ]
    if (allMarkers.length > 0) {
      this.map.setFitView(allMarkers, true, [60, 60, 60, 60])
    }
  }

  /**
   * 销毁钩子
   */
  public destroy() {
    this.watchers.forEach(unwatch => unwatch())
    this.ctripMarkersMap.forEach(m => m.setMap(null))
    this.osmMarkersMap.forEach(m => m.setMap(null))
    if (this.infoWindow) {
      this.infoWindow.close()
    }
  }

  /**
   * 清除所有Marker
   */
  public clearAll() {
    this.ctripMarkersMap.forEach(m => m.setMap(null))
    this.ctripMarkersMap.clear()
    this.osmMarkersMap.forEach(m => m.setMap(null))
    this.osmMarkersMap.clear()
    if (this.infoWindow) {
      this.infoWindow.close()
    }
  }

  // ========== 私有方法 ==========

  private createCtripMarkerDOM(poi: CtripPOI, isActive: boolean): string {
    const color = CATEGORY_COLORS[poi.category] || '#FF6B35'
    const borderColor = isActive ? '#10B981' : 'white'
    const scale = isActive ? 1.2 : 1
    
    return `
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid ${borderColor};
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        transform: scale(${scale});
        transition: transform 0.2s, border-color 0.2s;
      ">
        <div style="
          width: 100%;
          height: 100%;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: white;
          font-weight: bold;
        ">${(poi.name || '?').charAt(0)}</div>
      </div>
    `
  }

  private createOsmMarkerDOM(osmPoi: OsmPOI): string {
    return `
      <div style="
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #6B7280;
        border: 2px solid #9CA3AF;
        opacity: 0.8;
        cursor: pointer;
      "></div>
    `
  }

  private openCtripInfoWindow(poi: CtripPOI) {
    if (this.infoWindow) {
      this.infoWindow.close()
    }

    const content = `
      <div style="
        width: 280px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div style="position: relative; height: 140px; overflow: hidden;">
          <img src="${poi.cover_url || ''}" style="width: 100%; height: 100%; object-fit: cover;" 
               onerror="this.style.display='none'" />
          <button onclick="window.__closeInfoWindow && window.__closeInfoWindow()" style="
            position: absolute; top: 8px; right: 8px;
            width: 24px; height: 24px; border-radius: 50%;
            background: rgba(0,0,0,0.5); color: white; border: none;
            font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          ">×</button>
          <div style="position: absolute; top: 8px; left: 8px; background: ${CATEGORY_COLORS[poi.category] || '#666'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
            ${poi.category}
          </div>
          ${poi.keytag ? `<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #FFD700; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
            ${poi.keytag}
          </div>` : ''}
        </div>
        <div style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="font-size: 16px; font-weight: 600; color: #1f2937; margin: 0;">${poi.name}</h3>
            <span style="color: #f59e0b; font-weight: 600; font-size: 14px;">⭐${poi.rating || '--'}</span>
          </div>
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 8px 0; line-height: 1.4;">
            ${poi.intro_text || poi.short_features?.[0] || ''}
          </p>
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            ${poi.review_total ? `<span style="font-size: 11px; color: #9ca3af;">${poi.review_total.toLocaleString()}条点评</span>` : ''}
          </div>
          <button onclick="window.__addToItinerary && window.__addToItinerary('${poi.poi_id}')" style="
            width: 100%;
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px;
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
          ">+ 加入自驾行程单</button>
        </div>
      </div>
    `

    this.infoWindow = new (window as any).AMap.InfoWindow({
      isCustom: true,
      content: content,
      offset: new (window as any).AMap.Pixel(0, -30)
    })

    // 注册全局关闭函数
    ;(window as any).__closeInfoWindow = () => {
      if (this.infoWindow) this.infoWindow.close()
    }

    const marker = this.ctripMarkersMap.get(poi.poi_id)
    if (marker) {
      this.infoWindow.open(this.map, marker.getPosition())
    }
  }

  private openOsmInfoWindow(osmPoi: OsmPOI) {
    if (this.infoWindow) {
      this.infoWindow.close()
    }

    const content = `
      <div style="
        width: 240px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        padding: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #6B7280;"></div>
          <span style="font-size: 11px; color: #6B7280;">OSM 小众景点</span>
        </div>
        <h3 style="font-size: 14px; font-weight: 600; color: #1f2937; margin: 0 0 4px 0;">${osmPoi.name}</h3>
        <p style="font-size: 12px; color: #6b7280; margin: 0;">${osmPoi.primary_tag}${osmPoi.specific_tag ? ' / ' + osmPoi.specific_tag : ''}</p>
      </div>
    `

    this.infoWindow = new (window as any).AMap.InfoWindow({
      isCustom: true,
      content: content,
      offset: new (window as any).AMap.Pixel(0, -20)
    })

    const marker = this.osmMarkersMap.get(osmPoi.osm_id)
    if (marker) {
      this.infoWindow.open(this.map, marker.getPosition())
    }
  }
}
