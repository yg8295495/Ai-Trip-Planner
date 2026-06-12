/**
 * 天气查询 - 独立池 5,000/月
 * 路线确认后用户主动触发。
 *  - base: 实况（小时级更新）
 *  - all:  未来 3 天预报
 *
 * 约束：出发日 > 5 天时，结果精度不足，UI 需提醒
 */

const AMAP_KEY = 'c866b4e29221cbc714a4fc78060f23b7'

const CACHE_TTL = {
  base: 30 * 60 * 1000,     // 实况缓存 30 分钟
  all: 3 * 60 * 60 * 1000,  // 预报缓存 3 小时
}

export interface WeatherLive {
  city: string
  adcode: string
  weather: string        // 天气现象
  temperature: string    // 实时气温 ℃
  winddirection: string
  windpower: string      // 风力级别
  humidity: string       // 湿度 %
  reporttime: string
}

export interface WeatherCast {
  date: string
  week: string
  dayweather: string
  nightweather: string
  daytemp: string
  nighttemp: string
  daywind: string
  nightwind: string
  daypower: string
  nightpower: string
}

export interface WeatherAll {
  city: string
  adcode: string
  province: string
  reporttime: string
  casts: WeatherCast[]
}

// 内存缓存
const cache = new Map<string, { data: any; ts: number }>()

function cacheKey(adcode: string, type: 'base' | 'all') {
  return `${adcode}_${type}`
}

function getCached<T>(key: string, ttl: number): T | null {
  const c = cache.get(key)
  if (!c) return null
  if (Date.now() - c.ts > ttl) {
    cache.delete(key)
    return null
  }
  return c.data as T
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() })
}

/** 实况天气 */
export async function getWeatherLive(adcode: string): Promise<WeatherLive | null> {
  const key = cacheKey(adcode, 'base')
  const cached = getCached<WeatherLive>(key, CACHE_TTL.base)
  if (cached) return cached

  const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&extensions=base&key=${AMAP_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== '1' || !data.lives?.[0]) return null
    const live = data.lives[0] as WeatherLive
    setCache(key, live)
    return live
  } catch (e) {
    console.error('Weather live failed:', e)
    return null
  }
}

/** 未来 3 天预报 */
export async function getWeatherForecast(adcode: string): Promise<WeatherAll | null> {
  const key = cacheKey(adcode, 'all')
  const cached = getCached<WeatherAll>(key, CACHE_TTL.all)
  if (cached) return cached

  const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&extensions=all&key=${AMAP_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== '1' || !data.forecasts?.[0]) return null
    const fc = data.forecasts[0] as WeatherAll
    setCache(key, fc)
    return fc
  } catch (e) {
    console.error('Weather forecast failed:', e)
    return null
  }
}

/** 批量取多个城市（并发上限 3/秒） */
export async function getWeatherBatch(adcodes: string[]): Promise<Map<string, WeatherAll | null>> {
  const result = new Map<string, WeatherAll | null>()
  // 分批：3 个一组，组间 350ms
  for (let i = 0; i < adcodes.length; i += 3) {
    const batch = adcodes.slice(i, i + 3)
    const promises = batch.map(async adcode => {
      const fc = await getWeatherForecast(adcode)
      result.set(adcode, fc)
    })
    await Promise.all(promises)
    if (i + 3 < adcodes.length) {
      await new Promise(r => setTimeout(r, 350))
    }
  }
  return result
}

/** 评估出发日距离今天的天数 */
export function daysUntil(departureDate: Date | null): number {
  if (!departureDate) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(departureDate)
  target.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

/** 精度提示 */
export function weatherAccuracyHint(days: number): { level: 'accurate' | 'ok' | 'unreliable'; message: string } {
  if (days < 0) return { level: 'unreliable', message: '出发日已过，仅供参考' }
  if (days <= 3) return { level: 'accurate', message: '天气预测准确' }
  if (days <= 5) return { level: 'ok', message: '天气预测基本准确' }
  return { level: 'unreliable', message: `距出发还有 ${days} 天，天气预测精度不足，建议临近时再查看` }
}
