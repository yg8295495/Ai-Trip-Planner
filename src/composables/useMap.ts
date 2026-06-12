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
          content: `<div style="background:${color};color:white;padding:3px 6px;border-radius:3px;font-size:11px;white-space:nowrap">${loc.name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -10),
        },
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })

    if (markers.length > 0) {
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

    const startLngLat = [confirmed[0].lon, confirmed[0].lat]
    const endLngLat = [confirmed[confirmed.length - 1].lon, confirmed[confirmed.length - 1].lat]
    const waypoints = confirmed.slice(1, -1).map((loc) => [loc.lon, loc.lat])

    console.log('Rendering route:', { start: startLngLat, end: endLngLat, waypoints })

    window.AMap.plugin('AMap.Driving', () => {
      driving = new window.AMap.Driving({
        map: map,
        policy: 0,
      })

      const opts = { waypoints }

      driving.search(startLngLat, endLngLat, opts, (status: string, result: any) => {
        console.log('Driving result:', status, result)
      })
    })
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
