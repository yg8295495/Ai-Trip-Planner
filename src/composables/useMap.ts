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

      const content = `
        <div style="background:${color};color:white;padding:4px 8px;border-radius:4px;font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${loc.name}</div>
      `

      const marker = new window.AMap.Marker({
        position: [loc.lon, loc.lat],
        content: content,
        offset: new window.AMap.Pixel(-40, -30),
        anchor: 'bottom-center',
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })
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

    window.AMap.plugin('AMap.Driving', () => {
      driving = new window.AMap.Driving({
        map: map,
        policy: window.AMap.DrivingPolicy.LEAST_TIME,
        hideMarkers: true,
      })

      const opts = {
        waypoints: waypoints,
      }

      driving.search(startLngLat, endLngLat, opts, (status: string) => {
        if (status === 'complete') {
          console.log('Driving route rendered')
        } else {
          console.warn('Driving route failed:', status)
        }
      })
    })
  }

  function updateMap() {
    if (!map) return
    renderPins()
    renderDrivingRoute()
  }

  onMounted(() => {
    setTimeout(initMap, 200)
  })

  onUnmounted(() => {
    if (driving) {
      driving.clear()
    }
  })

  return { updateMap }
}
