"""
携程城市景点全量采集脚本
- REST API 批量采集，不需 Playwright
- 限速 10-15 秒/请求
- 断点续传：已采集的城市跳过
- 输出：backend/data/ctrip_attractions.json
"""
import json
import os
import time
import requests
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "ctrip_attractions.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "ctrip_progress.json")

API_URL = "https://m.ctrip.com/restapi/soa2/18109/json/getAttractionList"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    "Content-Type": "application/json",
    "Referer": "https://you.ctrip.com/sight/beijing1.html",
    "Origin": "https://you.ctrip.com"
}

# 噪音关键词（名称含这些的排除）
NOISE_KEYWORDS = [
    "演出", "话剧", "相声", "表演", "门票", "索道", "观光车", "缆车", "接驳车",
    "演出票", "车票", "船票", "套票", "联票", "优惠票",
    "酒店", "住宿", "民宿", "公寓", "客栈",
    "餐厅", "美食", "小吃", "烧烤", "火锅",
    "KTV", "酒吧", "网吧", "棋牌", "足疗", "按摩",
    "一日游", "两日游", "跟团", "自由行",
]

# 城市 ID 映射（清洗后 1170 个中国城市）
CITIES_FILE = os.path.join(DATA_DIR, "cn_city_id_map.json")


def load_cities():
    """加载城市 ID 映射"""
    if os.path.exists(CITIES_FILE):
        with open(CITIES_FILE, "r") as f:
            return json.load(f)
    
    # 从携程首页提取
    print("从携程首页提取城市 ID 映射...")
    import subprocess
    result = subprocess.run([
        "node", "-e", f"""
const {{ chromium }} = require('/Users/LiYuan/.npm/_npx/0b9ff77863cb6e9f/node_modules/playwright-core');
(async () => {{
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const pages = context.pages();
    let page = null;
    for (const p of pages) {{
        if (p.url().includes('you.ctrip.com') && !p.url().includes('sight')) {{ page = p; break; }}
    }}
    if (!page) {{ console.log(JSON.stringify([])); await browser.close(); return; }}
    const data = await page.evaluate(() => {{
        const links = Array.from(document.querySelectorAll('a'));
        const cities = [];
        const seen = new Set();
        for (const a of links) {{
            const href = a.href || '';
            const m = href.match(/\\/place\\/([a-z]+?)(\\d+)\\.html/);
            if (m) {{
                const pinyin = m[1];
                const id = parseInt(m[2]);
                const name = a.textContent.trim().replace('旅游攻略', '');
                if (name.length >= 2 && name.length <= 10 && !seen.has(pinyin)) {{
                    seen.add(pinyin);
                    cities.push({{ name, pinyin, id }});
                }}
            }}
        }}
        return cities;
    }});
    console.log(JSON.stringify(data));
    await browser.close();
}})();
"""
    ], capture_output=True, text=True, timeout=30)
    
    cities = json.loads(result.stdout.strip())
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CITIES_FILE, "w") as f:
        json.dump(cities, f, ensure_ascii=False, indent=2)
    return cities


def load_progress():
    """加载已采集进度"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"collected_cities": [], "total_attractions": 0}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, ensure_ascii=False)


def load_existing_data():
    """加载已采集的数据"""
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r") as f:
            return json.load(f)
    return []


def save_data(data):
    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False)


def is_noise(name):
    """检查是否是噪音数据"""
    for kw in NOISE_KEYWORDS:
        if kw in name:
            return True
    return False


def fetch_city_attractions(district_id, city_name, existing_poi_ids):
    """采集一个城市的景点数据"""
    payload = {
        "scene": "online",
        "districtId": district_id,
        "index": 1,
        "sortType": 1,
        "count": 20,
        "returnModuleType": "product",
        "head": {"cid": "09031084117872684107", "ctok": "", "cver": "1.0", "lang": "01", "sid": "8888", "syscode": "999", "auth": ""}
    }
    
    all_attractions = []
    page = 1
    max_pages = 50  # 每个城市最多50页（1000条景点）
    
    while page <= max_pages:
        payload["index"] = page
        try:
            resp = requests.post(API_URL, json=payload, headers=HEADERS, timeout=15)
            data = resp.json()
            
            if data.get("result") != 0:
                break
            
            items = data.get("attractionList", [])
            if not items:
                break
            
            for item in items:
                card = item.get("card", {})
                name = card.get("poiName", "")
                if not name or is_noise(name):
                    continue
                
                coord = card.get("coordinate", {})
                attraction = {
                    "city": city_name,
                    "district_id": district_id,
                    "poi_id": card.get("poiId") or card.get("businessId", ""),
                    "business_id": card.get("businessId", ""),
                    "name": name,
                    "score": card.get("commentScore", ""),
                    "review_count": card.get("commentCount", 0),
                    "zone": card.get("zoneName", ""),
                    "tags": card.get("tagNameList", []),
                    "cover_image": card.get("coverImageUrl", ""),
                    "distance": card.get("distanceStr", ""),
                    "open_status": card.get("openStatus", ""),
                    "heat_score": card.get("heatScore", ""),
                    "lat": coord.get("latitude"),
                    "lng": coord.get("longitude"),
                    "is_free": card.get("isFree", False),
                    "short_features": card.get("shortFeatures", []),
                    "detail_url": card.get("detailUrl", ""),
                    "level": "5A" if "5A" in name else "4A" if "4A" in name else "",
                }
                all_attractions.append(attraction)
            
            # 如果这一页数据少于20条，说明是最后一页
            if len(items) < 20:
                break
            
            if not data.get("hasMore", False):
                break
            
            page += 1
            time.sleep(10)  # 限速 10 秒
            
        except Exception as e:
            print(f"  错误: {e}")
            time.sleep(15)
            break
            
            items = data.get("attractionList", [])
            if not items:
                break
            
            for item in items:
                card = item.get("card", {})
                name = card.get("poiName", "")
                poi_id = card.get("poiId") or card.get("businessId", "")
                
                if not name or is_noise(name):
                    continue
                
                # ID 重复检查：如果该景点已采集过，则跳过
                if poi_id in existing_poi_ids:
                    continue
                
                coord = card.get("coordinate", {})
                attraction = {
                    "city": city_name,
                    "district_id": district_id,
                    "poi_id": poi_id,
                    "business_id": card.get("businessId", ""),
                    "name": name,
                    "score": card.get("commentScore", ""),
                    "review_count": card.get("commentCount", 0),
                    "zone": card.get("zoneName", ""),
                    "tags": card.get("tagNameList", []),
                    "cover_image": card.get("coverImageUrl", ""),
                    "distance": card.get("distanceStr", ""),
                    "open_status": card.get("openStatus", ""),
                    "heat_score": card.get("heatScore", ""),
                    "lat": coord.get("latitude"),
                    "lng": coord.get("longitude"),
                    "is_free": card.get("isFree", False),
                    "short_features": card.get("shortFeatures", []),
                    "detail_url": card.get("detailUrl", ""),
                    "level": "5A" if "5A" in name else "4A" if "4A" in name else "",
                }
                all_attractions.append(attraction)
                existing_poi_ids.add(poi_id)
            
            if not data.get("hasMore", False):
                break
            
            page += 1
            time.sleep(10)  # 限速 10 秒
            
        except Exception as e:
            print(f"  错误: {e}")
            time.sleep(15)
            break
    
    return all_attractions


def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 开始携程全量采集")
    
    cities = load_cities()
    progress = load_progress()
    all_data = load_existing_data()
    
    collected_set = set(progress["collected_cities"])
    remaining = [c for c in cities if c["id"] not in collected_set]
    
    # 建立已采集 POI ID 集合，防止跨城市重复
    collected_poi_ids = {a.get("poi_id") for a in all_data if a.get("poi_id")}
    
    print(f"总城市: {len(cities)} | 已采集: {len(collected_set)} | 剩余: {len(remaining)}")
    print(f"已采集景点: {len(all_data)} 条 | 已记录 POI ID: {len(collected_poi_ids)} 个")
    
    for i, city in enumerate(remaining):
        city_id = city["id"]
        city_name = city["name"]
        
        print(f"[{i+1}/{len(remaining)}] {city_name} (ID:{city_id})...", end=" ", flush=True)
        
        # 传入已采集的 poi_id 集合
        attractions = fetch_city_attractions(city_id, city_name, collected_poi_ids)
        all_data.extend(attractions)
        collected_set.add(city_id)
        
        print(f"{len(attractions)} 条")
        
        # 每个城市保存一次
        save_data(all_data)
        progress["collected_cities"] = list(collected_set)
        progress["total_attractions"] = len(all_data)
        save_progress(progress)
        
        time.sleep(12)  # 城市间也限速
    
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 采集完成")
    print(f"总景点: {len(all_data)} 条")


if __name__ == "__main__":
    main()
