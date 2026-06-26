"""
携程详情页数据源研究
- 测试 REST API 端点
- 测试 __NEXT_DATA__ HTML 提取
"""
import requests
import json
import re
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 故宫测试
TEST_URL = "https://you.ctrip.com/sight/beijing1/100052.html"
TEST_POI_ID = 100052


def test_rest_api():
    """测试 REST API 端点"""
    print("=== 测试 REST API ===")

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Content-Type": "application/json",
        "Referer": "https://you.ctrip.com/sight/beijing1/100052.html",
        "Origin": "https://you.ctrip.com"
    }

    # 从聚合页 API 基础路径推测详情页 API
    endpoints = [
        ("getAttractionDetail", {"scene": "online", "poiId": TEST_POI_ID, "head": {"cid": "09031084117872684107", "ctok": "", "cver": "1.0", "lang": "01", "sid": "8888", "syscode": "999", "auth": ""}}),
        ("getSightDetail", {"sightId": TEST_POI_ID}),
        ("getProductDetail", {"productId": TEST_POI_ID, "productType": 1}),
    ]

    for name, payload in endpoints:
        url = f"https://m.ctrip.com/restapi/soa2/18109/json/{name}"
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            print(f"  {name}: {resp.status_code}")
            if resp.ok:
                data = resp.json()
                print(f"    keys: {list(data.keys())[:10]}")
                if data.get("result") == 0 or data.get("success"):
                    print(f"    ✓ 可能可用！")
                    return name, payload
        except Exception as e:
            print(f"    ERROR: {e}")
        time.sleep(2)

    print("  REST API 均不通，尝试 __NEXT_DATA__")
    return None, None


def test_next_data():
    """从 __NEXT_DATA__ 提取详情数据"""
    print("\n=== 测试 __NEXT_DATA__ ===")

    try:
        resp = requests.get(TEST_URL, headers=HEADERS, timeout=15)
        print(f"  HTTP {resp.status_code}, 长度 {len(resp.text)}")

        if resp.status_code != 200:
            print(f"  请求失败")
            return None

        html = resp.text

        # 提取 __NEXT_DATA__
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
        if not match:
            print("  未找到 __NEXT_DATA__")
            # 检查是否有其他 script 标签包含数据
            scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
            print(f"  共 {len(scripts)} 个 script 标签")
            return None

        data = json.loads(match.group(1))
        print(f"  __NEXT_DATA__ 大小: {len(match.group(1))} bytes")
        print(f"  顶层 keys: {list(data.keys())}")

        # 递归搜索景点数据
        result = find_sight_data(data)
        if result:
            return result

        # 尝试按路径访问
        props = data.get("props", {})
        page_props = props.get("pageProps", {})
        print(f"  pageProps keys: {list(page_props.keys())[:15]}")

        # 检查常见路径
        for path in ["sightDetail", "detail", "attraction", "product", "initialState"]:
            if path in page_props:
                print(f"  找到 pageProps.{path}")
                detail = page_props[path]
                if isinstance(detail, dict):
                    print(f"    keys: {list(detail.keys())[:15]}")
                    return detail

        return None

    except Exception as e:
        print(f"  ERROR: {e}")
        return None


def find_sight_data(obj, depth=0, path=""):
    """递归搜索景点相关数据"""
    if depth > 8:
        return None

    if isinstance(obj, dict):
        # 检查是否包含景点特征字段
        keys = set(obj.keys())
        sight_markers = {"sightName", "poiName", "name", "sightId", "poiId"}
        if keys & sight_markers:
            print(f"  找到景点数据 at {path} (depth={depth})")
            print(f"    keys: {list(obj.keys())[:20]}")
            # 显示关键字段
            for k in ["sightName", "poiName", "name", "address", "openTime", "ticket", "phone"]:
                if k in obj:
                    val = str(obj[k])[:80]
                    print(f"    {k}: {val}")
            return obj

        for k, v in obj.items():
            result = find_sight_data(v, depth + 1, f"{path}.{k}")
            if result:
                return result

    elif isinstance(obj, list):
        for i, item in enumerate(obj[:10]):
            result = find_sight_data(item, depth + 1, f"{path}[{i}]")
            if result:
                return result

    return None


def test_mobile_api():
    """测试移动端 API"""
    print("\n=== 测试移动端 API ===")

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Content-Type": "application/json",
        "Referer": "https://m.ctrip.com/webapp/you/sight/beijing1/100052.html",
        "Origin": "https://m.ctrip.com"
    }

    # 移动端 API 端点
    endpoints = [
        ("https://m.ctrip.com/restapi/soa2/18109/json/getAttractionDetail", {"scene": "online", "poiId": TEST_POI_ID}),
        ("https://m.ctrip.com/restapi/soa2/18109/json/getSightDetail", {"scene": "online", "sightId": TEST_POI_ID, "from": "sight"}),
        ("https://m.ctrip.com/restapi/soa2/18109/json/getDetail", {"scene": "online", "id": TEST_POI_ID, "type": 1}),
    ]

    for url, payload in endpoints:
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            print(f"  {url.split('/')[-1]}: {resp.status_code}")
            if resp.ok:
                data = resp.json()
                if data.get("result") == 0 or data.get("success"):
                    print(f"    ✓ 可用！keys: {list(data.keys())[:10]}")
                    return url, payload
                else:
                    print(f"    result={data.get('result')}, msg={data.get('message', '')[:50]}")
        except Exception as e:
            print(f"    ERROR: {e}")
        time.sleep(2)

    return None, None


if __name__ == "__main__":
    # 1. 测试 REST API
    api_url, api_payload = test_rest_api()

    # 2. 测试 __NEXT_DATA__
    next_data = test_next_data()

    # 3. 测试移动端 API
    mobile_url, mobile_payload = test_mobile_api()

    # 总结
    print("\n=== 总结 ===")
    if api_url:
        print(f"✓ REST API 可用: {api_url}")
    if next_data:
        print(f"✓ __NEXT_DATA__ 可用")
    if mobile_url:
        print(f"✓ 移动端 API 可用: {mobile_url}")

    if not any([api_url, next_data, mobile_url]):
        print("✗ 所有数据源均不可用，需要进一步研究")
