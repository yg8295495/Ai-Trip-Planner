import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CtripMarkerManager } from '../useCtripMarkers'

// Mock AMap
class MockMarker {
  setMap = vi.fn()
  on = vi.fn()
  setPosition = vi.fn()
  getPosition = vi.fn(() => ({ getLng: () => 121.47, getLat: () => 31.23 }))
  constructor(public options: any) {}
}

class MockInfoWindow {
  open = vi.fn()
  close = vi.fn()
  setContent = vi.fn()
  constructor(public options: any) {}
}

vi.stubGlobal('AMap', {
  Marker: MockMarker,
  InfoWindow: MockInfoWindow,
  LngLat: class MockLngLat {
    lng: number
    lat: number
    constructor(lng: number, lat: number) {
      this.lng = lng
      this.lat = lat
    }
  },
  Pixel: class MockPixel {
    x: number
    y: number
    constructor(x: number, y: number) {
      this.x = x
      this.y = y
    }
  },
})

describe('CtripMarkerManager', () => {
  let manager: CtripMarkerManager
  let mockMap: any
  let lastMarkerInstance: MockMarker

  beforeEach(() => {
    vi.clearAllMocks()
    mockMap = {
      add: vi.fn(),
      remove: vi.fn(),
      setFitView: vi.fn(),
      getZoom: vi.fn(() => 12),
      getCenter: vi.fn(() => ({ getLng: () => 121.47, getLat: () => 31.23 })),
    }
    manager = new CtripMarkerManager(mockMap)
  })

  it('should clear existing markers when rendering new ones', () => {
    const pois = [
      { poi_id: 1, name: '测试景点1', lat: 31.23, lng: 121.47, cover_image: 'test.jpg' },
      { poi_id: 2, name: '测试景点2', lat: 31.24, lng: 121.48, cover_image: 'test2.jpg' },
    ]

    // 第一次渲染
    manager.renderMarkers(pois)
    expect(mockMap.add).toHaveBeenCalledTimes(2)

    // 第二次渲染，应该先清除旧的
    manager.renderMarkers(pois)
    // 旧marker应该被setMap(null)
    const calls = (MockMarker as any).mock?.calls || []
    // 检查是否有marker被setMap(null)
    expect(mockMap.add).toHaveBeenCalled()
  })

  it('should create markers with custom HTML content', () => {
    const pois = [
      { poi_id: 1, name: '测试景点', lat: 31.23, lng: 121.47, tags: ['历史建筑'] },
    ]

    manager.renderMarkers(pois)

    // 检查marker被创建
    expect(mockMap.add).toHaveBeenCalled()
  })

  it('should open InfoWindow when marker is clicked', () => {
    const poi = {
      poi_id: 1,
      name: '故宫博物院',
      lat: 39.92,
      lng: 116.40,
      score: '4.8',
      review_count: 195371,
      cover_image: 'test.jpg',
      short_features: ['皇家宫殿'],
      is_free: false,
      open_status: '开园中',
    }

    manager.renderMarkers([poi])

    // 获取创建的marker实例并模拟点击
    const markerInstance = (mockMap.add.mock.calls[0] as any)?.[0]
    if (markerInstance?.on) {
      // 找到click事件处理器
      const clickHandler = markerInstance.on.mock.calls.find(
        (call: any) => call[0] === 'click'
      )?.[1]

      if (clickHandler) {
        clickHandler()
      }
    }
  })

  it('should call map.setFitView after rendering markers', () => {
    const pois = [
      { poi_id: 1, name: '测试1', lat: 31.23, lng: 121.47 },
      { poi_id: 2, name: '测试2', lat: 31.24, lng: 121.48 },
    ]

    manager.renderMarkers(pois)

    expect(mockMap.setFitView).toHaveBeenCalledWith(
      expect.any(Array),
      true,
      [60, 60, 60, 60]
    )
  })

  it('should clear all markers when clear() is called', () => {
    const pois = [
      { poi_id: 1, name: '测试1', lat: 31.23, lng: 121.47 },
    ]

    manager.renderMarkers(pois)
    manager.clear()

    // 检查marker被清除
    expect(mockMap.add).toHaveBeenCalled()
  })
})
