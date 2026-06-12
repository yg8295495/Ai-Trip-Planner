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

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let routeLines: any[] = []
  let currentRouteInfo: RouteInfo | null = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    map = new window.AMap.Map(containerRef.value, {
      zoom: 7,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
    renderRouteByREST()
  }

  function renderPins() {
    markers.forEach((m) => map.remove(m))
    markers = []

    store.locations.forEach((loc) => {
      const color = loc.selected
        ? PIN_STATUS_COLORS.confirmed
        : PIN_STATUS_COLORS.suggested

      const marker = new window.AMap.Marker({
        position: [loc.lon, loc.lat],
        title: loc.name,
        label: {
          content: `<div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${loc.name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -8),
        },
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })

    if (markers.length > 1) {
      map.setFitView()
    }
  }

  function renderPoiMarkers(pois: any[]) {
    const poiMarkers = markers.filter((m) => m.getExtData()?.isPoi)
    poiMarkers.forEach((m) => map.remove(m))
    markers = markers.filter((m) => !m.getExtData()?.isPoi)

    pois.forEach((poi) => {
      const [lng, lat] = poi.location.split(',').map(Number)
      const marker = new window.AMap.Marker({
        position: [lng, lat],
        title: poi.name,
        label: {
          content: `<div style="background:#3B82F6;color:white;padding:3px 6px;border-radius:3px;font-size:11px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.2)">${poi.name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -8),
        },
        extData: { isPoi: true, poi },
      })

      marker.on('click', () => {
        store.setSelectedPoi(poi)
      })

      map.add(marker)
      markers.push(marker)
    })
  }

  async function renderRouteByREST(): Promise<RouteInfo | null> {
    routeLines.forEach((l) => map.remove(l))
    routeLines = []

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return null

    const origin = `${confirmed[0].lon},${confirmed[0].lat}`
    const destination = `${confirmed[confirmed.length - 1].lon},${confirmed[confirmed.length - 1].lat}`
    const waypoints = confirmed.slice(1, -1).map((loc) => `${loc.lon},${loc.lat}`)

    try {
      let url = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${AMAP_KEY}&extensions=all`
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
          // 提取城市
          if (step.cities) {
            step.cities.forEach((city: any) => {
              if (city.citycode && !cityMap.has(city.citycode)) {
                cityMap.set(city.citycode, city.name)
                cities.push({ code: city.citycode, name: city.name })
              }
            })
          }

          // 提取路线坐标
          if (step.polyline) {
            step.polyline.split(';').forEach((point: string) => {
              const [lng, lat] = point.split(',').map(Number)
              polylinePoints.push([lng, lat])
            })
          }
        })

        // 绘制路线
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
      console.warn('Route calculation failed:', err)
    }

    return null
  }

  function getRouteInfo(): RouteInfo | null {
    return currentRouteInfo
  }

  function updateMap() {
    if (!map) return
    renderPins()
    renderRouteByREST()
  }

  onMounted(() => {
    setTimeout(initMap, 300)
  })

  return { updateMap, renderPoiMarkers, getRouteInfo, renderRouteByREST }
}
