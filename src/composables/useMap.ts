import { onMounted, type Ref } from 'vue'
import { useTripStore, type RouteInfo as StoreRouteInfo } from '@/store/tripStore'
import { PIN_STATUS_COLORS } from '@/constants/categories'
import type { GeocodedPlace } from '@/types'

declare global {
  interface Window {
    AMap: any
  }
}

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export type RouteInfo = StoreRouteInfo

export const ROUTE_STRATEGIES = [
  { value: 0, label: '高速优先', icon: '🛣️', desc: '优先高速，里程和时间均衡' },
  { value: 1, label: '距离最短', icon: '📏', desc: '走最短路径，可能经过小路' },
  { value: 3, label: '不走高速', icon: '🏔️', desc: '全程国道/省道，免费但慢' },
  { value: 7, label: '高速+国道', icon: '🚗', desc: '高速优先但允许走一段国道' },
] as const

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let routeLines: any[] = []
  let currentRouteInfo: RouteInfo | null = null
  let isSatellite = false
  let satelliteLayer: any = null
  let originMarker: any = null
  let destMarker: any = null
  const clickHandlers: Array<(lng: number, lat: number) => void> = []

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    satelliteLayer = new window.AMap.TileLayer.Satellite()

    map = new window.AMap.Map(containerRef.value, {
      zoom: 7,
      center: [115, 30],
      viewMode: '2D',
    })

    // 监听地图点击 -> 触发所有 clickHandlers
    map.on('click', (e: any) => {
      const lng = e.lnglat.getLng()
      const lat = e.lnglat.getLat()
      clickHandlers.forEach(h => h(lng, lat))
    })

    renderPins()
  }

  function onMapClick(handler: (lng: number, lat: number) => void) {
    clickHandlers.push(handler)
  }

  function toggleSatellite() {
    if (!map) return
    isSatellite = !isSatellite
    if (isSatellite) {
      map.addLayer(satelliteLayer)
    } else {
      map.removeLayer(satelliteLayer)
    }
  }

  function zoomIn() { if (map) map.zoomIn() }
  function zoomOut() { if (map) map.zoomOut() }

  function renderPins() {
    markers.forEach((m) => map.remove(m))
    markers = []

    store.locations.forEach((loc) => {
      const color = loc.selected ? PIN_STATUS_COLORS.confirmed : PIN_STATUS_COLORS.suggested
      const marker = new window.AMap.Marker({
        position: [loc.lon, loc.lat],
        title: loc.name,
        label: {
          content: `<div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;font-weight:500">${loc.name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -10),
        },
      })
      marker.on('click', () => store.toggleLocation(loc.id))
      map.add(marker)
      markers.push(marker)
    })

    if (markers.length > 1) map.setFitView()
  }

  function renderPoiMarkers(pois: any[]) {
    const poiMarkers = markers.filter((m) => m.getExtData()?.isPoi)
    poiMarkers.forEach((m) => map.remove(m))
    markers = markers.filter((m) => !m.getExtData()?.isPoi)

    pois.forEach((poi) => {
      const [lng, lat] = poi.location.split(',').map(Number)
      const hasPhoto = poi.photos && poi.photos.length > 0
      const content = hasPhoto
        ? `<div style="position:relative"><img src="${poi.photos[0].url}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"/><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#3B82F6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;white-space:nowrap">${poi.name}</div></div>`
        : `<div style="background:#3B82F6;color:white;padding:4px 8px;border-radius:4px;font-size:11px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.2);cursor:pointer">${poi.name}</div>`

      const marker = new window.AMap.Marker({
        position: [lng, lat],
        title: poi.name,
        content,
        offset: new window.AMap.Pixel(hasPhoto ? -24 : -30, hasPhoto ? -55 : -15),
        extData: { isPoi: true, poi },
      })
      marker.on('click', () => store.togglePoiSelection(poi))
      map.add(marker)
      markers.push(marker)
    })
  }

  // 地理编码：文本 → 坐标
  async function geocode(address: string): Promise<{ lat: number; lon: number; level?: string; formatted?: string } | null> {
    try {
      const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status === '1' && data.geocodes?.[0]) {
        const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
        return { lat, lon, level: data.geocodes[0].level, formatted: data.geocodes[0].formatted_address }
      }
    } catch (err) {
      console.error('Geocode failed:', err)
    }
    return null
  }

  // 单条策略路线（内部用）
  async function computeSingleRoute(
    origin: GeocodedPlace,
    dest: GeocodedPlace,
    strategy: number
  ): Promise<RouteInfo | null> {
    if (!map) return null

    let originLoc = `${origin.lon},${origin.lat}`
    let destLoc = `${dest.lon},${dest.lat}`

    // 缺坐标才 geocode（避免覆盖已有精确坐标）
    if (origin.lat == null || origin.lon == null) {
      const oc = await geocode(origin.query)
      if (!oc) return null
      originLoc = `${oc.lon},${oc.lat}`
    }
    if (dest.lat == null || dest.lon == null) {
      const dc = await geocode(dest.query)
      if (!dc) return null
      destLoc = `${dc.lon},${dc.lat}`
    }

    const confirmed = store.confirmedLocations
    const waypoints = confirmed.map((loc) => `${loc.lon},${loc.lat}`)

    try {
      let url = `https://restapi.amap.com/v3/direction/driving?origin=${originLoc}&destination=${destLoc}&key=${AMAP_KEY}&extensions=all&strategy=${strategy}`
      if (waypoints.length > 0) {
        url += `&waypoints=${waypoints.join('|')}`
      }

      const res = await fetch(url)
      const data = await res.json()

      if (data.status === '1' && data.route?.paths?.[0]) {
        const path = data.route.paths[0]
        const cities: { code: string; name: string }[] = []
        const cityMap = new Map<string, string>()
        const polylinePoints: number[][] = []
        const mainRoadsSet = new Set<string>()
        let tollDistance = 0
        let trafficLights = 0
        let highwayDistance = 0

        path.steps.forEach((step: any) => {
          if (step.cities) {
            step.cities.forEach((city: any) => {
              if (city.citycode && !cityMap.has(city.citycode)) {
                cityMap.set(city.citycode, city.name)
                cities.push({ code: city.citycode, name: city.name })
              }
            })
          }
          if (step.polyline) {
            step.polyline.split(';').forEach((point: string) => {
              const [lng, lat] = point.split(',').map(Number)
              polylinePoints.push([lng, lat])
            })
          }
          if (step.toll_distance) tollDistance += Number(step.toll_distance)
          if (step.traffic_lights) trafficLights += Number(step.traffic_lights)
          if (step.road && /高速|高架|快速路/.test(step.road) && step.distance) {
            highwayDistance += Number(step.distance)
            if (step.road.length >= 3 && step.road.length <= 12) mainRoadsSet.add(step.road)
          } else if (step.road && /国道|省道/.test(step.road) && step.road.length <= 12) {
            mainRoadsSet.add(step.road)
          }
        })

        return {
          distance: Number(path.distance),
          duration: Number(path.duration),
          cities,
          polyline: polylinePoints,
          strategy,
          tollDistance: tollDistance || undefined,
          tolls: path.tolls ? Number(path.tolls) : undefined,
          trafficLights: trafficLights || undefined,
          highwayDistance: highwayDistance || undefined,
          mainRoads: Array.from(mainRoadsSet).slice(0, 8),
        }
      }
    } catch (err) {
      console.error(`Route compute failed (strategy ${strategy}):`, err)
    }
    return null
  }

  // 渲染路线到地图（清旧画新）
  function renderRoutePolyline(routeInfo: RouteInfo) {
    routeLines.forEach((l) => map.remove(l))
    routeLines = []
    if (routeInfo.polyline.length === 0) return
    const line = new window.AMap.Polyline({
      path: routeInfo.polyline,
      strokeColor: '#3B82F6',
      strokeWeight: 6,
      strokeOpacity: 0.9,
    })
    map.add(line)
    routeLines.push(line)
  }

  // 计算 + 渲染 + 落 store（新签名：传参）
  async function renderRouteByREST(
    origin: GeocodedPlace,
    dest: GeocodedPlace,
    strategy: number
  ): Promise<RouteInfo | null> {
    if (!map) return null
    const info = await computeSingleRoute(origin, dest, strategy)
    if (!info) return null
    currentRouteInfo = info
    renderRoutePolyline(info)
    return info
  }

  // 并发计算多种策略路线（用于预览对比）
  // ⚠️ 当前版本：单策略按需算（用户切策略时 MapPanel.watch currentStrategy 触发）
  //    保留此函数以备未来"策略对比表"功能用
  // async function prefetchStrategies(
  //   origin: GeocodedPlace,
  //   dest: GeocodedPlace,
  //   strategies: readonly number[] = [0, 1, 3, 7]
  // ): Promise<RouteInfo[]> {
  //   const results = await Promise.all(
  //     strategies.map(s => computeSingleRoute(origin, dest, s))
  //   )
  //   return results.filter((r): r is RouteInfo => r !== null)
  // }

  function fitView() {
    if (routeLines.length > 0) map.setFitView(routeLines)
    else if (markers.length > 0) map.setFitView()
  }

  function getRouteInfo() { return currentRouteInfo }

  function updateMap() {
    if (!map) return
    renderPins()
    const o = store.params.origin
    const d = store.params.destination
    if (o && d) {
      renderRouteByREST(o, d, store.currentStrategy)
    }
  }

  function getMap() {
    return map
  }

  function panTo(lng: number, lat: number, zoom?: number) {
    if (!map) return
    if (zoom !== undefined) {
      map.setZoomAndCenter(zoom, [lng, lat])
    } else {
      map.panTo([lng, lat])
    }
  }

  function addTempMarker(lng: number, lat: number, color: string = '#EF4444') {
    if (!map) return null
    const m = new window.AMap.Marker({
      position: [lng, lat],
      content: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 0 2px ${color}40"></div>`,
      offset: new window.AMap.Pixel(-7, -7),
    })
    map.add(m)
    return m
  }

  // 标记起点/终点（持久 marker，不被清除）
  function setEndpointMarker(kind: 'origin' | 'dest', lng: number, lat: number, label: string) {
    if (!map) return
    if (kind === 'origin' && originMarker) map.remove(originMarker)
    if (kind === 'dest' && destMarker) map.remove(destMarker)
    const color = kind === 'origin' ? '#10B981' : '#EF4444'
    const m = new window.AMap.Marker({
      position: [lng, lat],
      content: `<div style="position:relative"><div style="width:18px;height:18px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div><div style="position:absolute;left:50%;top:-22px;transform:translateX(-50%);background:${color};color:white;padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;font-weight:500">${label}</div></div>`,
      offset: new window.AMap.Pixel(-9, -9),
    })
    map.add(m)
    if (kind === 'origin') originMarker = m
    else destMarker = m
  }

  function clearEndpointMarkers() {
    if (originMarker) { map.remove(originMarker); originMarker = null }
    if (destMarker) { map.remove(destMarker); destMarker = null }
  }

  onMounted(() => { setTimeout(initMap, 300) })

  return {
    updateMap, renderPoiMarkers, getRouteInfo, renderRouteByREST,
    computeSingleRoute,
    fitView, toggleSatellite, zoomIn, zoomOut,
    onMapClick, getMap, panTo, addTempMarker,
    setEndpointMarker, clearEndpointMarkers,
    geocode,
    ROUTE_STRATEGIES,
  }
}
