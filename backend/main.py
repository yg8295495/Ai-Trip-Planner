from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import subprocess
import os
import json
import requests
from services.recommendation import get_recommendation_engine

# Load env vars
load_dotenv(dotenv_path=".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "你是一个专业的旅游规划专家。用户会提供出行计划，你负责给出友好的路线规划建议。\n"
    "请用中文回复，语气亲切自然。"
)

# Provider 不可用时的降级提示
PROVIDER_UNAVAILABLE_PROMPT = (
    "注意：你正在接手另一个 AI 助手的对话。以下历史记录来自不同的 AI 模型，"
    "请基于这些上下文信息继续为用户提供旅游规划建议。"
)


def assemble_system_prompt(adcodes: list = None, weather_info: dict = None) -> str:
    """
    组装 System Prompt，注入景点和天气信息。

    Args:
        adcodes: 途经城市的 adcode 列表
        weather_info: 天气信息字典

    Returns:
        完整的 System Prompt
    """
    prompt_parts = [SYSTEM_PROMPT]

    # 注入景点信息 (O(1) 内存匹配)
    if adcodes:
        engine = get_recommendation_engine()
        attractions = engine.get_attractions_by_adcodes(adcodes)
        if attractions:
            attraction_names = [a["name"] for a in attractions]
            prompt_parts.append(f"\n当前路线途经景点：{', '.join(attraction_names)}")
            prompt_parts.append("请基于这些景点为用户提供建议。")

    # 注入天气信息
    if weather_info:
        prompt_parts.append(f"\n当前天气信息：{json.dumps(weather_info, ensure_ascii=False)}")

    return "\n".join(prompt_parts)


def call_gemini_api(message: str, chat_history: list, system_prompt: str = None) -> dict:
    """Call Google Gemini API."""
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    contents = []
    for msg in chat_history:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.get("text", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt or SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }

    try:
        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return {"text": text, "envelope": {}}
    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code == 429:
            return {"text": "Gemini API 配额已耗尽，请稍后重试或切换到其他模型。", "envelope": {}, "provider_unavailable": True}
        raise


def call_deepseek_api(message: str, chat_history: list, system_prompt: str = None) -> dict:
    """Call DeepSeek API (OpenAI-compatible)."""
    api_key = os.getenv("DEEPSEEK_API_KEY")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    url = "https://api.deepseek.com/chat/completions"

    messages = [{"role": "system", "content": system_prompt or SYSTEM_PROMPT}]
    for msg in chat_history:
        role = "user" if msg.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": msg.get("text", "")})
    messages.append({"role": "user", "content": message})

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 2048}

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"text": text, "envelope": {}}
    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code in (401, 429):
            return {"text": "DeepSeek API 不可用，请稍后重试或切换到其他模型。", "envelope": {}, "provider_unavailable": True}
        raise


def call_local_cli(provider, message):
    cmd = ["mimo", "run", "-m", "mimo/mimo-auto", "--dangerously-skip-permissions", "-c", message] if provider == 'mimo' else ["codebuddy", "-p", message, "-c"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    return {"text": result.stdout}


@app.post("/api/chat")
async def chat(request: Request):
    data = await request.json()
    provider = data.get("provider")
    user_message = data.get("user_message")
    chat_history = data.get("chat_history", [])
    continue_session = data.get("continue_session", False)
    adcodes = data.get("adcodes", [])
    weather_info = data.get("weather_info")

    # 组装 System Prompt (注入景点和天气信息)
    system_prompt = assemble_system_prompt(adcodes, weather_info)

    # 如果是继续会话且有历史，注入切换提示
    if continue_session and chat_history:
        chat_history = list(chat_history)  # copy
        chat_history.insert(0, {"role": "system", "text": PROVIDER_UNAVAILABLE_PROMPT})

    # 1. 检测 API Key (优先走 API)
    if provider == "gemini" and os.getenv("GEMINI_API_KEY"):
        return call_gemini_api(user_message, chat_history, system_prompt)
    elif provider == "deepseek" and os.getenv("DEEPSEEK_API_KEY"):
        return call_deepseek_api(user_message, chat_history, system_prompt)

    # 2. 降级：走本地 CLI
    return call_local_cli(provider, user_message)


import sqlite3
from typing import Optional

@app.get("/api/pois")
async def get_pois(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    category: Optional[str] = None,  # 携程分类标签
    city: Optional[str] = None,       # 城市过滤
    limit: int = 25                   # 每类最多25个
):
    """
    查询携程景点数据
    - category: 携程分类标签（如 "历史建筑", "自然山水" 等）
    - city: 城市名称
    - limit: 每类最多25个
    """
    db_path = os.path.join(os.path.dirname(__file__), "local_travel.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 携程标签分类列表
    CATEGORIES = [
        "历史建筑", "自然山水", "主题乐园&游乐场", "亲子同乐",
        "博物馆&展馆", "地标观景", "城市漫步", "夜游观景",
        "赏花胜地", "遛娃宝藏地", "亲近动物", "园林花园", "缆车索道"
    ]

    # 如果指定了分类，查询该分类
    if category and category in CATEGORIES:
        # 需要从原始数据中查询，因为 poi_details 表没有 tags 字段
        # 改为查询 ctrip_attractions.json
        import json
        attractions_file = os.path.join(os.path.dirname(__file__), "data", "ctrip_attractions.json")
        if os.path.exists(attractions_file):
            with open(attractions_file, 'r', encoding='utf-8') as f:
                attractions = json.load(f)
            
            # 按标签过滤
            filtered = [
                a for a in attractions
                if category in a.get('tags', [])
            ]
            
            # 按城市过滤
            if city:
                filtered = [a for a in filtered if city in a.get('city', '')]
            
            # 按热度排序
            filtered.sort(key=lambda x: x.get('review_count', 0), reverse=True)
            
            # 限制数量
            result = filtered[:limit]
            
            conn.close()
            return {"pois": result, "total": len(result), "category": category}
    
    # 默认：返回热门景点（从数据库查询，使用ctrip_id作为主键）
    cursor.execute("""
        SELECT ctrip_id, gaode_name as name, review_total as review_count, review_good_rate as score
        FROM poi_details
        WHERE ctrip_id IS NOT NULL
        ORDER BY review_total DESC
        LIMIT ?
    """, (limit,))
    
    db_pois = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # 从JSON文件补充坐标等信息
    import json
    attractions_file = os.path.join(os.path.dirname(__file__), "data", "ctrip_attractions.json")
    if os.path.exists(attractions_file):
        with open(attractions_file, 'r', encoding='utf-8') as f:
            attractions = json.load(f)
        
        # 建立poi_id到attraction的映射
        attraction_map = {a['poi_id']: a for a in attractions}
        
        # 合并数据
        result = []
        for db_poi in db_pois:
            ctrip_id = db_poi.get('ctrip_id')
            if ctrip_id in attraction_map:
                attr = attraction_map[ctrip_id]
                result.append({
                    'poi_id': ctrip_id,
                    'name': attr.get('name', db_poi.get('name')),
                    'city': attr.get('city', ''),
                    'lat': attr.get('lat'),
                    'lng': attr.get('lng'),
                    'score': attr.get('score', ''),
                    'review_count': attr.get('review_count', 0),
                    'tags': attr.get('tags', []),
                    'cover_image': attr.get('cover_image', ''),
                    'open_status': attr.get('open_status', ''),
                    'short_features': attr.get('short_features', []),
                    'is_free': attr.get('is_free', False),
                })
        
        return {"pois": result, "total": len(result), "categories": CATEGORIES}
    
    return {"pois": [], "total": 0, "categories": CATEGORIES}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)


# ============================================================
# 空间检索接口
# ============================================================

from pydantic import BaseModel
from typing import List, Optional

class BoundsRect(BaseModel):
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float

class SearchPayload(BaseModel):
    bounds_list: List[BoundsRect]
    category: Optional[str] = None
    is_route_mode: bool = False
    limit: int = 25

@app.post("/api/pois/search")
async def search_ctrip_pois(payload: SearchPayload):
    """
    多矩形空间检索携程景点
    - bounds_list: 支持多个矩形（周边盲选传1个，路线沿途传多个矩形）
    - category: 携程分类标签（可选）
    - is_route_mode: 路线模式（5A/4A优先排序）
    - limit: 返回数量限制
    """
    db_path = os.path.join(os.path.dirname(__file__), "local_travel.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 动态组装多矩形拼接SQL
    bounds_conds = []
    params = []
    for b in payload.bounds_list:
        bounds_conds.append("(pd.lat BETWEEN ? AND ? AND pd.lng BETWEEN ? AND ?)")
        params.extend([b.min_lat, b.max_lat, b.min_lng, b.max_lng])

    geo_filter = " OR ".join(bounds_conds)

    # 基础查询：联合图片表（去重）
    query = f"""
        SELECT DISTINCT pd.*, pi.url as cover_image_url 
        FROM poi_details pd
        LEFT JOIN poi_images pi ON pd.osm_id = pi.osm_id AND pi.is_cover = 1
        WHERE pd.ctrip_id IS NOT NULL
        AND ({geo_filter})
    """

    # 分类标签过滤
    if payload.category:
        query += " AND pd.review_tags LIKE ?"
        params.append(f"%{payload.category}%")

    # 排序策略
    if payload.is_route_mode:
        query += " ORDER BY CASE WHEN pd.keytag LIKE '%5A%' THEN 3 WHEN pd.keytag LIKE '%4A%' THEN 2 ELSE 1 END DESC, pd.review_total DESC"
    else:
        query += " ORDER BY pd.review_good_rate DESC, pd.review_total DESC"

    query += " LIMIT ?"
    params.append(payload.limit)

    cursor.execute(query, params)
    pois = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {"pois": pois, "total": len(pois)}


@app.get("/api/pois/osm-discover")
async def discover_osm_pois(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    limit: int = 15
):
    """
    OSM长尾发现接口
    - 当携程库没有覆盖时，从OSM骨架库中发现小众景点
    - 仅返回 tourism/historic/leisure 标签的POI
    - 排除已收录的携程点
    """
    db_path = os.path.join(os.path.dirname(__file__), "local_travel.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = """
        SELECT lp.* FROM local_pois lp
        WHERE (lp.lat BETWEEN ? AND ?) AND (lp.lon BETWEEN ? AND ?)
          AND (lp.primary_tag IN ('tourism', 'historic', 'leisure'))
          AND (lp.osm_id NOT IN (SELECT osm_id FROM poi_details WHERE ctrip_id IS NOT NULL))
        ORDER BY lp.id ASC 
        LIMIT ?
    """
    cursor.execute(query, [min_lat, max_lat, min_lng, max_lng, limit])
    osm_pois = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {"osm_pois": osm_pois, "total": len(osm_pois)}
