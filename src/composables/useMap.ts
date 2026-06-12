import { onMounted, onUnmounted, type Ref } from 'vue'
import { useTripStore } from '@/store/tripStore'
import { PIN_STATUS_COLORS } from '@/constants/categories'

declare global {
  interface Window {
    AMap: any
  }
}

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export function useMap(containerRef: Ref<HTMLElement | null>) {
  const store = useTripStore()
  let map: any = null
  let markers: any[] = []
  let routeLines: any[] = []

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

  async function renderRouteByREST() {
    routeLines.forEach((l) => map.remove(l))
    routeLines = []

    const confirmed = store.confirmedLocations
    if (confirmed.length < 2) return

    for (let i = 0; i < confirmed.length - 1; i++) {
      const from = confirmed[i]
      const to = confirmed[i + 1]

      const origin = `${from.lon},${from.lat}`
      const destination = `${to.lon},${to.lat}`

      try {
        const url = `https://restapi.amap.com/v3/direction/driving?origin=${origin}&destination=${destination}&key=${AMAP_KEY}&extensions=all`
        const res = await fetch(url)
        const data = await res.json()

        if (data.status === '1' && data.route?.paths?.[0]?.steps) {
          const steps = data.route.paths[0].steps
          const path: number[][] = []

          steps.forEach((step: any) => {
            const polyline = step.polyline
            if (polyline) {
              polyline.split(';').forEach((point: string) => {
                const [lng, lat] = point.split(',').map(Number)
                path.push([lng, lat])
              })
            }
          })

          if (path.length > 0) {
            const line = new window.AMap.Polyline({
              path,
              strokeColor: '#3B82F6',
              strokeWeight: 6,
              strokeOpacity: 0.9,
            })
            map.add(line)
            routeLines.push(line)
          }
        }
      } catch (err) {
        console.warn(`Route ${from.name} -> ${to.name} failed:`, err)
      }
    }

    if (routeLines.length > 0) {
      map.setFitView()
    }
  }

  function updateMap() {
    if (!map) return
    renderPins()
    renderRouteByREST()
  }

  onMounted(() => {
    setTimeout(initMap, 300)
  })

  return { updateMap }
}
