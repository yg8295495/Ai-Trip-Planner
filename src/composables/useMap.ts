import { ref, onMounted, type Ref } from 'vue'
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
  let polyline: any = null

  function initMap() {
    if (!containerRef.value || !window.AMap) return

    map = new window.AMap.Map(containerRef.value, {
      zoom: 6,
      center: [115, 30],
      viewMode: '2D',
    })

    renderPins()
    renderRoute()
  }

  function renderPins() {
    markers.forEach((m) => map.remove(m))
    markers = []

    const allLocations = store.locations
    allLocations.forEach((loc) => {
      const color = loc.selected
        ? PIN_STATUS_COLORS.confirmed
        : PIN_STATUS_COLORS.suggested

      const marker = new window.AMap.Marker({
        position: [loc.lon, loc.lat],
        title: loc.name,
        label: {
          content: `<div style="background:${color};color:white;padding:2px 6px;border-radius:4px;font-size:12px;white-space:nowrap">${loc.name}</div>`,
          direction: 'top',
        },
      })

      marker.on('click', () => {
        store.setSelectedLocation(loc.id)
      })

      map.add(marker)
      markers.push(marker)
    })
  }

  function renderRoute() {
    if (polyline) {
      map.remove(polyline)
    }

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return

    const path = confirmed.map((loc) => [loc.lon, loc.lat])

    polyline = new window.AMap.Polyline({
      path,
      strokeColor: '#3B82F6',
      strokeWeight: 4,
      strokeOpacity: 0.8,
    })

    map.add(polyline)
    map.setFitView()
  }

  onMounted(() => {
    setTimeout(initMap, 100)
  })

  return { renderPins, renderRoute }
}
