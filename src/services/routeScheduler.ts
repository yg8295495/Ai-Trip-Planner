const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export interface RouteResult {
  distance: number
  duration: number
  polyline: [number, number][]
  strategy: number
  tolls?: number
  trafficLights?: number
  mainRoads?: string[]
}

export async function computeRoute(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  strategy: number = 2,
  waypoints: { lat: number; lon: number }[] = []
): Promise<RouteResult[]> {
  const originLoc = `${origin.lon},${origin.lat}`
  const destLoc = `${destination.lon},${destination.lat}`

  let url = `https://restapi.amap.com/v3/direction/driving?` +
    `origin=${originLoc}&destination=${destLoc}&key=${AMAP_KEY}&extensions=all&strategy=${strategy}`

  if (waypoints.length > 0) {
    const pts = waypoints.map(w => `${w.lon},${w.lat}`).join('|')
    url += `&waypoints=${pts}`
  }

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== '1' || !data.route?.paths?.length) return []

  return data.route.paths.map((path: any) => {
    const polyline: [number, number][] = []
    const mainRoadsSet = new Set<string>()

    path.steps.forEach((step: any) => {
      if (step.polyline) {
        step.polyline.split(';').forEach((point: string) => {
          const [lng, lat] = point.split(',').map(Number)
          polyline.push([lng, lat])
        })
      }
      if (step.road && /高速|高架|快速路/.test(step.road) && step.distance) {
        if (step.road.length >= 3 && step.road.length <= 12) mainRoadsSet.add(step.road)
      } else if (step.road && /[GH]?\d{1,3}|国道|省道/.test(step.road) && step.road.length <= 12) {
        mainRoadsSet.add(step.road)
      }
    })

    return {
      distance: Number(path.distance),
      duration: Number(path.duration),
      polyline,
      strategy,
      tolls: path.tolls ? Number(path.tolls) : undefined,
      trafficLights: path.traffic_lights != null ? Number(path.traffic_lights) : undefined,
      mainRoads: Array.from(mainRoadsSet).slice(0, 8)
    }
  })
}
