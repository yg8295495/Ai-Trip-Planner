/**
 * 浏览器定位 - AMap.Geolocation 插件
 * 基础地图定位服务（独立池，不与基础搜索共享）
 *  - 手机：GPS 高精度
 *  - 电脑：高德内置 IP + WiFi 识别（精度较低但能用）
 *
 * 失败时不回退到 /v3/ip（已知城市级漂移严重），
 * 改为提示用户手动输入起点。
 */

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

export interface GeoPosition {
  lat: number
  lon: number
  accuracy: number          // 米
  address: string           // "湖南省长沙市天心区..."
  province: string
  city: string
  district: string
  adcode: string
  isGps: boolean            // 是否真正 GPS
}

let pluginPromise: Promise<any> | null = null

/** 加载 AMap.Geolocation 插件 */
function loadPlugin(): Promise<any> {
  if (pluginPromise) return pluginPromise
  pluginPromise = new Promise((resolve, reject) => {
    if (!window.AMap) {
      reject(new Error('AMap JS API not loaded'))
      return
    }
    if (window.AMap.Geolocation) {
      resolve(window.AMap.Geolocation)
      return
    }
    window.AMap.plugin('AMap.Geolocation', () => {
      if (window.AMap.Geolocation) resolve(window.AMap.Geolocation)
      else reject(new Error('AMap.Geolocation plugin load failed'))
    })
  })
  return pluginPromise
}

/** 获取当前位置（GPS 优先，失败时 IP 兜底） */
export function getCurrentPosition(): Promise<GeoPosition> {
  return loadPlugin().then(
    (Geolocation: any) =>
      new Promise<GeoPosition>((resolve, reject) => {
        const geo = new Geolocation({
          enableHighAccuracy: true,    // 优先 GPS
          timeout: 10000,              // 10 秒超时
          maximumAge: 60000,           // 缓存 1 分钟
          noIpLocate: 0,               // 0 = 失败时回退 IP（高德内置）
          noGeoLocation: 0,            // 0 = 允许浏览器定位
          needAddress: true,           // 直接拿地址
          extensions: 'all',
        })

        geo.getCurrentPosition((status: string, result: any) => {
          if (status !== 'complete') {
            reject(new Error(result?.message || `Geo failed: ${status}`))
            return
          }
          // AMap.Geolocation 返回结构
          const isGps = result.position_type === 'android' ||
                        result.position_type === 'ios' ||
                        result.position_type === 'html5' ||
                        result.location_type === 'gcj02' && result.accuracy < 100
          const ac = result.addressComponent || {}

          resolve({
            lat: result.position.lat,
            lon: result.position.lng,
            accuracy: result.accuracy || 0,
            address: result.formattedAddress || '',
            province: ac.province || '',
            city: ac.city || ac.province || '',
            district: ac.district || '',
            adcode: ac.adcode || '',
            isGps,
          })
        })
      })
  )
}

/** 判断浏览器是否支持 Geolocation API（用于给用户提示） */
export function isGeoSupported(): boolean {
  return 'geolocation' in navigator
}

/** 拿 IP 定位的 city 字段（仅作文字提示，不作坐标）*/
export async function getIpCity(): Promise<string | null> {
  try {
    const res = await fetch(`https://restapi.amap.com/v3/ip?key=${AMAP_KEY}`)
    const data = await res.json()
    if (data.status === '1') return data.city || null
  } catch {}
  return null
}
