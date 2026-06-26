"""
高德 5A/4A/世界遗产 POI 多边形扫描
31 省 × types=110201|110202|110203
存入 backend/data/amap_heritage_pois.json
"""
import sqlite3
import json
import os
import time
import requests
from urllib.parse import quote

# ── 配置 ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "amap_heritage_pois.json")
AMAP_KEY = os.environ.get("AMAP_KEY", "c866b4e29221cbc714a4fc78060f23b7")
AMAP_TYPES = "110201|110202|110203"  # 世界遗产|国家级|省级
PAGE_SIZE = 25
RATE_LIMIT = 0.3  # 每次请求间隔

# ── 31 省 bounding box (不含港澳台) ──
PROVINCES = [
    ("北京", 39.4, 41.1, 115.4, 117.5),
    ("天津", 38.3, 39.6, 116.7, 118.1),
    ("河北", 36.0, 42.7, 113.4, 119.9),
    ("山西", 34.6, 40.7, 110.2, 114.6),
    ("内蒙古", 37.4, 53.3, 97.1, 126.1),
    ("辽宁", 38.7, 43.5, 118.8, 125.8),
    ("吉林", 40.8, 46.3, 121.6, 131.3),
    ("黑龙江", 43.4, 53.6, 121.1, 135.1),
    ("上海", 30.7, 31.9, 120.9, 122.0),
    ("江苏", 30.7, 35.2, 116.4, 121.9),
    ("浙江", 27.1, 31.3, 118.0, 123.0),
    ("安徽", 29.4, 34.7, 114.9, 119.9),
    ("福建", 23.5, 28.3, 115.7, 120.8),
    ("江西", 24.5, 30.1, 113.6, 118.5),
    ("山东", 34.3, 38.4, 114.8, 122.7),
    ("河南", 31.4, 36.4, 110.4, 116.6),
    ("湖北", 29.0, 33.3, 108.4, 116.1),
    ("湖南", 24.6, 30.1, 108.8, 114.3),
    ("广东", 20.1, 25.5, 109.7, 117.3),
    ("广西", 20.9, 26.4, 104.3, 112.1),
    ("海南", 18.1, 20.2, 108.6, 111.1),
    ("重庆", 28.2, 32.2, 105.3, 110.1),
    ("四川", 26.0, 34.3, 97.4, 108.5),
    ("贵州", 24.6, 29.2, 103.6, 109.5),
    ("云南", 21.1, 29.2, 97.5, 106.2),
    ("西藏", 26.9, 36.5, 78.4, 99.1),
    ("陕西", 31.7, 39.6, 105.5, 111.2),
    ("甘肃", 32.6, 42.8, 92.1, 108.7),
    ("青海", 31.6, 39.2, 89.4, 103.1),
    ("宁夏", 35.2, 39.4, 104.2, 107.7),
    ("新疆", 34.3, 49.2, 73.4, 96.4),
]


def build_polygon(lat_min, lat_max, lon_min, lon_max):
    """构建矩形多边形（高德格式：经度,纬度|...）"""
    return f"{lon_min},{lat_min}|{lon_max},{lat_min}|{lon_max},{lat_max}|{lon_min},{lat_max}"


def query_polygon(province, polygon, offset=1):
    """查询单个多边形区域"""
    url = "https://restapi.amap.com/v3/place/polygon"
    params = {
        "key": AMAP_KEY,
        "polygon": polygon,
        "types": AMAP_TYPES,
        "extensions": "all",
        "offset": PAGE_SIZE,
        "page": offset,
        "output": "json"
    }
    resp = requests.get(url, params=params, timeout=15)
    data = resp.json()

    if data.get("status") != "1":
        return {"count": 0, "pois": [], "error": data.get("info", "unknown")}

    count = int(data.get("count", 0))
    pois = data.get("pois", [])

    results = []
    for poi in pois:
        loc = poi.get("location", "").split(",")
        photos = poi.get("photos", [])
        photo_urls = [p.get("url", "") for p in photos if p.get("url")]

        results.append({
            "amap_id": poi.get("id", ""),
            "name": poi.get("name", ""),
            "typecode": poi.get("typecode", ""),
            "type": poi.get("type", ""),
            "address": poi.get("address", ""),
            "location": {"lng": float(loc[0]) if len(loc) == 2 else 0, "lat": float(loc[1]) if len(loc) == 2 else 0},
            "province": province,
            "photos": photo_urls,
            "rating": poi.get("biz_ext", {}).get("rating", ""),
            "cost": poi.get("biz_ext", {}).get("cost", ""),
        })

    return {"count": count, "pois": results, "error": None}


def run():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 加载已有数据（断点续传）
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
            for poi in existing_data.get("pois", []):
                existing[poi["amap_id"]] = True
        print(f"[RESUME] 已有 {len(existing)} 条，跳过已采集")

    all_pois = []
    total_api_calls = 0
    type_labels = {"110201": "世界遗产", "110202": "国家级", "110203": "省级"}

    print(f"[START] 31 省扫描，types=110201|110202|110203")
    print(f"[CONFIG] API Key: {AMAP_KEY[:8]}..., 间隔: {RATE_LIMIT}s")
    print()

    for province, lat_min, lat_max, lon_min, lon_max in PROVINCES:
        polygon = build_polygon(lat_min, lat_max, lon_min, lon_max)

        # 第一页拿总数
        result = query_polygon(province, polygon, offset=1)
        total_api_calls += 1
        time.sleep(RATE_LIMIT)

        if result["error"]:
            print(f"  {province}: ERROR - {result['error']}")
            continue

        count = result["count"]
        if count == 0:
            print(f"  {province}: 0 条")
            continue

        # 翻页
        pages = (count + PAGE_SIZE - 1) // PAGE_SIZE
        new_count = 0
        for poi in result["pois"]:
            if poi["amap_id"] not in existing:
                all_pois.append(poi)
                existing[poi["amap_id"]] = True
                new_count += 1

        for page in range(2, pages + 1):
            result = query_polygon(province, polygon, offset=page)
            total_api_calls += 1
            time.sleep(RATE_LIMIT)

            for poi in result.get("pois", []):
                if poi["amap_id"] not in existing:
                    all_pois.append(poi)
                    existing[poi["amap_id"]] = True
                    new_count += 1

        # 统计该省类型分布
        type_dist = {}
        for poi in all_pois:
            if poi["province"] == province:
                tc = poi.get("typecode", "")
                type_dist[tc] = type_dist.get(tc, 0) + 1

        dist_str = " | ".join(f"{type_labels.get(k, k)}:{v}" for k, v in sorted(type_dist.items()))
        print(f"  {province}: +{new_count} 条 (总计{count}条, API×{pages}) [{dist_str}]")

    # 保存
    output = {
        "meta": {
            "source": "amap_polygon",
            "types": AMAP_TYPES,
            "provinces": len(PROVINCES),
            "total_api_calls": total_api_calls,
            "total_pois": len(all_pois),
            "scan_time": time.strftime("%Y-%m-%dT%H:%M:%S")
        },
        "pois": all_pois
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print()
    print(f"[DONE] 总计 {len(all_pois)} 条 POI，{total_api_calls} 次 API 调用")
    print(f"[SAVE] {OUTPUT_FILE}")

    # 类型总分布
    all_types = {}
    for poi in all_pois:
        tc = poi.get("typecode", "")
        all_types[tc] = all_types.get(tc, 0) + 1
    print(f"\n类型分布:")
    for tc, cnt in sorted(all_types.items(), key=lambda x: -x[1]):
        print(f"  {type_labels.get(tc, tc)}({tc}): {cnt}")


if __name__ == "__main__":
    run()
