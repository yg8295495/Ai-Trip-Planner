import { onMounted, type Ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { PIN_STATUS_COLORS } from '@/constants/categories'

declare global {
  interface Window {
    AMap: any
  }
}

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export interface RouteInfo {
  distance: number
  duration: number
  cities: { code: string; name: string }[]
  polyline: number[][]
}

export const ROUTE_STRATEGIES = [
  { value: 0, label: '高速优先', icon: '🛣️' },
  { value: 1, label: '距离最短', icon: '📏' },
  { value: 3, label: '不走高速', icon: '🏔️' },
  { value: 7, label: '高速+国道', icon: '🚗' },
]

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let routeLines: any[] = []
  let currentRouteInfo: RouteInfo | null = null
  let currentStrategy = 0
  let isSatellite = false
  let satelliteLayer: any = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    satelliteLayer = new window.AMap.TileLayer.Satellite()

    map = new window.AMap.Map(containerRef.value, {
      zoom: 7,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
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
  function setStrategy(strategy: number) { currentStrategy = strategy; renderRouteByREST() }

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
  async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${AMAP_KEY}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status === '1' && data.geocodes?.[0]) {
        const [lon, lat] = data.geocodes[0].location.split(',').map(Number)
        return { lat, lon }
      }
    } catch (err) {
      console.error('Geocode failed:', err)
    }
    return null
  }

  // 计算路线
  async function renderRouteByREST(): Promise<RouteInfo | null> {
    routeLines.forEach((l) => map.remove(l))
    routeLines = []

    const originText = store.params.origin?.query
    const destText = store.params.destination?.query
    if (!originText || !destText) return null

    // 地理编码获取坐标
    const originCoord = await geocode(originText)
    const destCoord = await geocode(destText)
    if (!originCoord || !destCoord) return null

    const origin = `${originCoord.lon},${originCoord.lat}`
    const destination = `${destCoord.lon},${destCoord.lat}`

    // 途经点（已确认的地点）
    const confirmed = store.confirmedLocations
    const waypoints = confirmed.map((loc) => `${loc.lon},${loc.lat}`)

    try {
      let url = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${AMAP_KEY}&extensions=all&strategy=${currentStrategy}`
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
        })

        if (polylinePoints.length > 0) {
          const line = new window.AMap.Polyline({
            path: polylinePoints,
            strokeColor: '#3B82F6',
            strokeWeight: 6,
            strokeOpacity: 0.9,
          })
          map.add(line)
          routeLines.push(line)
        }

        currentRouteInfo = {
          distance: Number(path.distance),
          duration: Number(path.duration),
          cities,
          polyline: polylinePoints,
        }

        map.setFitView()
        return currentRouteInfo
      }
    } catch (err) {
      console.error('Route calculation failed:', err)
    }

    return null
  }

  function fitView() {
    if (routeLines.length > 0) map.setFitView(routeLines)
    else if (markers.length > 0) map.setFitView()
  }

  function getRouteInfo() { return currentRouteInfo }

  function updateMap() {
    if (!map) return
    renderPins()
    renderRouteByREST()
  }

  onMounted(() => { setTimeout(initMap, 300) })

  return { updateMap, renderPoiMarkers, getRouteInfo, renderRouteByREST, setStrategy, fitView, toggleSatellite, zoomIn, zoomOut, ROUTE_STRATEGIES }
}
