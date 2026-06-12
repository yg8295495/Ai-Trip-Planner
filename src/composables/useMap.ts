import { onMounted, onUnmounted, type Ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { PIN_STATUS_COLORS } from '@/constants/categories'

declare global {
  interface Window {
    AMap: any
    AMapDriving: any
  }
}

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let routeLine: any = null
  let driving: any = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    map = new window.AMap.Map(containerRef.value, {
      zoom: 6,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
    renderDrivingRoute()
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
          content: `<div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.2)">${loc.name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -30),
        },
        icon: new window.AMap.Icon({
          size: new window.AMap.Size(25, 34),
          image: 'https://webapi.amap.com/theme/v1.3/markers/n/markers.png',
          imageOffset: new window.AMap.Pixel(0, -34),
        }),
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })
  }

  function renderDrivingRoute() {
    if (routeLine) {
      map.remove(routeLine)
      routeLine = null
    }

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return

    const origin = new window.AMap.LngLat(confirmed[0].lon, confirmed[0].lat)
    const destination = new window.AMap.LngLat(
      confirmed[confirmed.length - 1].lon,
      confirmed[confirmed.length - 1].lat
    )

    const waypoints = confirmed.slice(1, -1).map(
      (loc) => new window.AMap.LngLat(loc.lon, loc.lat)
    )

    driving = new window.AMap.Driving({
      map: map,
      policy: window.AMap.DrivingPolicy.LEAST_TIME,
    })

    driving.search(origin, destination, { waypoints }, (status: string, result: any) => {
      if (status === 'complete') {
        console.log('Route calculated')
      } else {
        console.error('Route failed:', status)
        renderSimpleRoute(confirmed)
      }
    })
  }

  function renderSimpleRoute(locations: any[]) {
    if (routeLine) {
      map.remove(routeLine)
    }

    const path = locations.map((loc) => [loc.lon, loc.lat])

    routeLine = new window.AMap.Polyline({
      path,
      strokeColor: '#3B82F6',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    })

    map.add(routeLine)
    map.setFitView()
  }

  function updateMap() {
    if (!map) return
    renderPins()
    renderDrivingRoute()
  }

  onMounted(() => {
    setTimeout(initMap, 100)
  })

  onUnmounted(() => {
    if (driving) {
      driving.clear()
    }
  })

  return { updateMap }
}
