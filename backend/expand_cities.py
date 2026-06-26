"""
携程城市层级展开脚本
- 从顶级城市页面提取区县级ID
- 支持递归展开（城市→区县→景点）
- 输出：backend/data/expanded_city_ids.json
"""
import requests
import re
import json
import os
import time
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "expanded_city_ids.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# 顶级城市列表（34个省级行政区）
TOP_LEVEL_CITIES = [
    {"name": "北京", "pinyin": "beijing", "id": 1},
    {"name": "上海", "pinyin": "shanghai", "id": 2},
    {"name": "天津", "pinyin": "tianjin", "id": 3},
    {"name": "重庆", "pinyin": "chongqing", "id": 158},
    {"name": "石家庄", "pinyin": "shijiazhuang", "id": 14},
    {"name": "太原", "pinyin": "taiyuan", "id": 34},
    {"name": "呼和浩特", "pinyin": "huhehaote", "id": 39},
    {"name": "沈阳", "pinyin": "shenyang", "id": 41},
    {"name": "长春", "pinyin": "changchun", "id": 45},
    {"name": "哈尔滨", "pinyin": "haerbin", "id": 48},
    {"name": "南京", "pinyin": "nanjing", "id": 9},
    {"name": "杭州", "pinyin": "hangzhou", "id": 14},
    {"name": "合肥", "pinyin": "hefei", "id": 19},
    {"name": "福州", "pinyin": "fuzhou", "id": 21},
    {"name": "南昌", "pinyin": "nanchang", "id": 27},
    {"name": "济南", "pinyin": "jinan", "id": 31},
    {"name": "郑州", "pinyin": "zhengzhou", "id": 37},
    {"name": "武汉", "pinyin": "wuhan", "id": 54},
    {"name": "长沙", "pinyin": "changsha", "id": 61},
    {"name": "广州", "pinyin": "guangzhou", "id": 63},
    {"name": "南宁", "pinyin": "nanning", "id": 74},
    {"name": "海口", "pinyin": "haikou", "id": 79},
    {"name": "成都", "pinyin": "chengdu", "id": 17},
    {"name": "贵阳", "pinyin": "guiyang", "id": 82},
    {"name": "昆明", "pinyin": "kunming", "id": 85},
    {"name": "拉萨", "pinyin": "lasa", "id": 91},
    {"name": "西安", "pinyin": "xian", "id": 7},
    {"name": "兰州", "pinyin": "lanzhou", "id": 96},
    {"name": "西宁", "pinyin": "xining", "id": 99},
    {"name": "银川", "pinyin": "yinchuan", "id": 102},
    {"name": "乌鲁木齐", "pinyin": "wulumuqi", "id": 104},
    {"name": "大连", "pinyin": "dalian", "id": 4},
    {"name": "青岛", "pinyin": "qingdao", "id": 5},
    {"name": "厦门", "pinyin": "xiamen", "id": 22},
]


def extract_district_ids(city_pinyin, city_id):
    """从城市页面提取区县级ID"""
    url = f"https://you.ctrip.com/sight/{city_pinyin}{city_id}.html"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return []
        
        html = resp.text
        # 提取所有 /place/pinyin{id}.html 链接
        links = re.findall(r'/place/([a-z]+?)(\d+)\.html', html)
        
        districts = []
        seen = set()
        for pinyin, id_str in links:
            id_val = int(id_str)
            if id_val not in seen and id_val != city_id:
                seen.add(id_val)
                districts.append({
                    "pinyin": pinyin,
                    "id": id_val,
                    "parent_city": city_pinyin,
                    "parent_id": city_id
                })
        
        return districts
    
    except Exception as e:
        print(f"  错误: {url} - {e}")
        return []


def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 开始城市层级展开")
    
    expanded = []
    
    for i, city in enumerate(TOP_LEVEL_CITIES):
        print(f"[{i+1}/{len(TOP_LEVEL_CITIES)}] {city['name']} (ID:{city['id']})...", end=" ", flush=True)
        
        districts = extract_district_ids(city["pinyin"], city["id"])
        expanded.extend(districts)
        
        print(f"找到 {len(districts)} 个子区域")
        time.sleep(2)  # 限速
    
    # 保存结果
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(expanded, f, ensure_ascii=False, indent=2)
    
    print(f"\n展开完成，共 {len(expanded)} 个子区域")
    print(f"结果保存到: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
