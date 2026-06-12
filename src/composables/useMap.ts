import { onMounted, onUnmounted, type Ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { PIN_STATUS_COLORS } from '@/constants/categories'

declare global {
  interface Window {
    AMap: any
  }
}

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let driving: any = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    map = new window.AMap.Map(containerRef.value, {
      zoom: 7,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
    setTimeout(renderDrivingRoute, 500)
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

  function renderDrivingRoute() {
    if (driving) {
      driving.clear()
      driving = null
    }

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return

    if (!window.AMap.Driving) {
      console.warn('AMap.Driving not available')
      return
    }

    const startLngLat = [confirmed[0].lon, confirmed[0].lat]
    const endLngLat = [confirmed[confirmed.length - 1].lon, confirmed[confirmed.length - 1].lat]
    const waypoints = confirmed.slice(1, -1).map((loc) => [loc.lon, loc.lat])

    driving = new window.AMap.Driving({
      map: map,
      policy: 0,
    })

    driving.search(startLngLat, endLngLat, { waypoints }, (status: string, result: any) => {
      if (status === 'complete') {
        console.log('Route rendered')
      } else {
        console.warn('Route failed:', status)
        renderFallbackRoute(confirmed)
      }
    })
  }

  function renderFallbackRoute(locations: any[]) {
    const path = locations.map((loc) => [loc.lon, loc.lat])
    const polyline = new window.AMap.Polyline({
      path,
      strokeColor: '#3B82F6',
      strokeWeight: 4,
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
    })
    map.add(polyline)
  }

  function updateMap() {
    if (!map) return
    renderPins()
    renderDrivingRoute()
  }

  onMounted(() => {
    setTimeout(initMap, 300)
  })

  onUnmounted(() => {
    if (driving) {
      driving.clear()
    }
  })

  return { updateMap }
}
