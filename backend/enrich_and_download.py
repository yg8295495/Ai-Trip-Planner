"""
Module 1-B: 景点短评多路并发生成
- 4 路 API（Gemini/Gemma）+ 2 路 CLI（mimo/codebuddy）
- 共享队列 + 线程池 + 动态字数阶梯
- 断点续传: summary IS NULL = 未处理
- 诊断日志: 各 Worker 吞吐统计
"""
import sqlite3
import json
import os
import sys
import time
import threading
import queue
import subprocess
import logging
from datetime import datetime

import requests

# ── 配置 ──────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "local_travel.db")
LOG_DIR = os.path.join(BASE_DIR, "logs")

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Gemini/Gemma API 格式
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# ── Worker 注册表 ─────────────────────────────────────
# 每个 worker: {name, type: "api"|"cli", model, key/base_cmd, rpm_limit}
WORKERS = [
    {"name": "gemini-a",   "type": "api", "model": "gemini-3.1-flash-lite", "key": os.getenv("GEMINI_KEY_A", "")},
    {"name": "gemma4-a",   "type": "api", "model": "gemma-4-31b-it",       "key": os.getenv("GEMINI_KEY_A", "")},
    {"name": "gemini-b",   "type": "api", "model": "gemini-3.1-flash-lite", "key": os.getenv("GEMINI_KEY_B", "")},
    {"name": "gemma4-b",   "type": "api", "model": "gemma-4-31b-it",       "key": os.getenv("GEMINI_KEY_B", "")},
    {"name": "mimo",       "type": "cli", "cmd": ["mimo", "run", "-m", "mimo/mimo-auto"]},
    {"name": "codebuddy",  "type": "cli", "cmd": ["codebuddy", "-p"]},
]

BATCH_SIZE = 500
CLI_TIMEOUT = 60
RATE_LIMIT_API = 4.5  # 15 RPM → 每请求间隔 4.5s（留 0.5s 宽限）

# ── 动态字数阶梯 ──────────────────────────────────────
PROMPT_FAMOUS = """你是一个资深的地理杂志主编和硬核自驾游领队。根据景点名称和标签，写一句激发向往的"自驾路书短评"。

【硬性约束】：
1. 字数 30-50 字，挖掘历史底蕴或地貌特色，有高级感。
2. 严禁废话复述。风格"一击必中"。
3. 分类公式：自然风光→点出地貌/最佳观赏姿势；人文历史→核心看点/历史厚重感；休闲→体感。

【输出】直接输出短评，无前缀无引号。"""

PROMPT_COLD = """你是一个地理杂志主编。根据景点名称和标签，写一句短评。

【硬性约束】：
1. 字数 10-20 字，极简提炼标签中的物理特征。
2. 严禁主观编造，严禁编造不存在的特色。
3. 如果标签信息不足以写出有意义的短评，就写"标签信息有限，建议实地探访"。

【输出】直接输出短评，无前缀无引号。"""

# ── 日志 ──────────────────────────────────────────────
def setup_logger():
    os.makedirs(LOG_DIR, exist_ok=True)
    today = datetime.now().strftime("%Y_%m_%d")
    logger = logging.getLogger("enrich")
    logger.setLevel(logging.DEBUG)

    fh = logging.FileHandler(
        os.path.join(LOG_DIR, f"enrich_process_{today}.log"), encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", "%Y-%m-%d %H:%M:%S"))

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))

    if not logger.handlers:
        logger.addHandler(fh)
        logger.addHandler(ch)
    return logger

log = setup_logger()

# ── Worker 诊断统计（线程安全）─────────────────────────
class WorkerStats:
    def __init__(self):
        self._lock = threading.Lock()
        self._data = {}

    def init_worker(self, name):
        with self._lock:
            self._data[name] = {"done": 0, "errors": 0, "total_time": 0.0}

    def record(self, name, success, elapsed):
        with self._lock:
            d = self._data[name]
            d["done"] += 1
            if not success:
                d["errors"] += 1
            d["total_time"] += elapsed

    def summary(self):
        with self._lock:
            return dict(self._data)

stats = WorkerStats()

# ── 数据库 ────────────────────────────────────────────
def ensure_columns(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(local_pois)")
    existing = {row[1] for row in cursor.fetchall()}
    if "summary" not in existing:
        cursor.execute("ALTER TABLE local_pois ADD COLUMN summary TEXT")
    if "local_image" not in existing:
        cursor.execute("ALTER TABLE local_pois ADD COLUMN local_image INTEGER DEFAULT 0")
    conn.commit()


def fetch_unprocessed(limit):
    conn = sqlite3.connect(DB_PATH)
    ensure_columns(conn)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, osm_id, name, raw_tags
        FROM local_pois
        WHERE summary IS NULL OR summary = ''
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return rows


def save_result(db_id, summary):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE local_pois SET summary = ? WHERE id = ?", (summary, db_id))
    conn.commit()
    conn.close()


# ── 判断是否"著名" ────────────────────────────────────
def is_famous(tags):
    return any(tags.get(k) for k in ["wikidata", "wikipedia", "wikimedia_commons", "image"])


def build_user_msg(name, tags):
    parts = []
    for k in ["tourism", "natural", "historic", "leisure", "amenity", "ele", "description"]:
        if k in tags:
            parts.append(f"{k}={tags[k]}")
    tag_str = "; ".join(parts[:5]) if parts else "无分类"
    return f"景点名称：{name}\n标签信息：{tag_str}"


# ── API 调用（Gemini/Gemma 格式）──────────────────────
def clean_llm_output(text):
    """清洗 LLM 输出：去掉引号、思维链标记"""
    text = text.strip().strip('"\'「」""''')
    # Gemma 4 思维链清洗：去掉 * / - 开头的分析行，取最后一段有意义的文本
    lines = text.split("\n")
    # 过滤掉纯标记行
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("* ") and (":" in stripped[:30] or "Topic" in stripped or "Constraint" in stripped or "Goal" in stripped):
            continue
        if stripped.startswith("- ") and len(stripped) < 10:
            continue
        if stripped.startswith("**") and stripped.endswith("**"):
            continue
        if stripped:
            clean_lines.append(stripped)
    if clean_lines:
        return clean_lines[-1]  # 取最后一行（通常是最终输出）
    return text


def call_gemini_api(api_key, model, system_prompt, user_msg):
    url = f"{GEMINI_BASE_URL}/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": user_msg}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 150}
    }
    resp = requests.post(url, json=payload, headers=HEADERS, timeout=30)
    if resp.ok:
        data = resp.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                text = parts[0].get("text", "").strip()
                return clean_llm_output(text)
    return None


# ── CLI 调用（阻塞式 subprocess）──────────────────────
def call_cli(cmd_parts, prompt_text):
    full_cmd = cmd_parts + [prompt_text]
    try:
        result = subprocess.run(
            full_cmd, capture_output=True, text=True, timeout=CLI_TIMEOUT)
        if result.returncode == 0:
            text = result.stdout.strip()
            return clean_llm_output(text)
    except subprocess.TimeoutExpired:
        log.info(f"  [TIMEOUT] CLI 超时 {CLI_TIMEOUT}s")
    except Exception as e:
        log.info(f"  [ERROR] CLI 异常: {e}")
    return None


# ── Worker 线程 ────────────────────────────────────────
def worker_thread(worker_cfg, task_queue, progress_lock, progress_counter, total):
    name = worker_cfg["name"]
    worker_type = worker_cfg["type"]
    stats.init_worker(name)

    while True:
        try:
            item = task_queue.get_nowait()
        except queue.Empty:
            break

        db_id, osm_id, name_poi, raw_tags_json = item
        tags = json.loads(raw_tags_json) if raw_tags_json else {}
        famous = is_famous(tags)
        prompt = PROMPT_FAMOUS if famous else PROMPT_COLD
        user_msg = build_user_msg(name_poi, tags)

        t0 = time.time()
        summary = None

        if worker_type == "api":
            summary = call_gemini_api(worker_cfg["key"], worker_cfg["model"], prompt, user_msg)
            time.sleep(RATE_LIMIT_API)
        elif worker_type == "cli":
            full_prompt = f"{prompt}\n\n{user_msg}"
            summary = call_cli(worker_cfg["cmd"], full_prompt)

        elapsed = time.time() - t0
        success = bool(summary) and len(summary) >= 5

        if success:
            save_result(db_id, summary)
            stats.record(name, True, elapsed)
        else:
            stats.record(name, False, elapsed)

        with progress_lock:
            progress_counter[0] += 1
            current = progress_counter[0]

        tag = "★" if famous else "·"
        status = "OK" if success else "FAIL"
        log.info(f"  [{current:>3}/{total}] {tag} {name:<12} | {name_poi[:12]:<12} | {status} | {elapsed:.1f}s")

        task_queue.task_done()


# ── 主入口 ────────────────────────────────────────────
def run(limit=BATCH_SIZE, workers=None):
    if workers is None:
        workers = WORKERS

    active_workers = [w for w in workers if w.get("key") or w["type"] == "cli"]
    if not active_workers:
        log.error("[ABORT] 没有可用的 Worker，请先配置 API Key")
        return

    rows = fetch_unprocessed(limit)
    if not rows:
        log.info("[DONE] 所有景点已处理完毕")
        return

    log.info(f"[START] 待处理: {len(rows)} | Workers: {len(active_workers)}")
    for w in active_workers:
        log.info(f"  → {w['name']} ({w['type']})")

    # 构建共享队列
    q = queue.Queue()
    for row in rows:
        q.put(row)

    total = q.qsize()
    progress_lock = threading.Lock()
    progress_counter = [0]

    # 启动所有 Worker 线程
    threads = []
    for w in active_workers:
        t = threading.Thread(target=worker_thread, args=(w, q, progress_lock, progress_counter, total))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    # 打印诊断统计
    print_worker_stats(total)


def print_worker_stats(total):
    s = stats.summary()
    log.info(f"\n{'='*55}")
    log.info(f"  诊断统计 — 共处理 {total} 条")
    log.info(f"{'='*55}")
    log.info(f"  {'Worker':<14} {'完成':>6} {'失败':>6} {'耗时':>8} {'均速':>8}")
    log.info(f"  {'-'*48}")
    for name, d in s.items():
        avg = d["total_time"] / d["done"] if d["done"] else 0
        log.info(f"  {name:<14} {d['done']:>6} {d['errors']:>6} {d['total_time']:>7.1f}s {avg:>6.1f}s/条")

    total_done = sum(d["done"] for d in s.values())
    total_errors = sum(d["errors"] for d in s.values())
    total_time = max(d["total_time"] for d in s.values()) if s else 0
    log.info(f"  {'-'*48}")
    log.info(f"  {'合计':<14} {total_done:>6} {total_errors:>6} {total_time:>7.1f}s")

    # 写入诊断文件
    diag_path = os.path.join(LOG_DIR, "worker_diagnostics.json")
    with open(diag_path, "w") as f:
        json.dump({"timestamp": datetime.now().isoformat(), "workers": s}, f, indent=2, ensure_ascii=False)
    log.info(f"\n  诊断详情已写入: {diag_path}")


def show_stats():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM local_pois")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM local_pois WHERE summary IS NOT NULL AND summary != ''")
    done = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM local_pois WHERE summary IS NOT NULL AND summary != '' AND length(summary) BETWEEN 30 AND 50")
    famous_ok = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM local_pois WHERE summary IS NOT NULL AND summary != '' AND length(summary) BETWEEN 10 AND 20")
    cold_ok = cursor.fetchone()[0]
    conn.close()

    print(f"\n=== 数据库状态 ===")
    print(f"  总 POI:       {total:,}")
    print(f"  有短评:       {done:,} ({done/total*100:.1f}%)")
    print(f"  30-50字(著名): {famous_ok:,}")
    print(f"  10-20字(冷门): {cold_ok:,}")


if __name__ == "__main__":
    os.makedirs(LOG_DIR, exist_ok=True)

    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        show_stats()
    elif len(sys.argv) > 1 and sys.argv[1] == "test":
        print("=== 50 条混合测试 ===")
        run(limit=50)
        show_stats()
    elif len(sys.argv) > 1 and sys.argv[1] == "full":
        print("=== 全量采集 ===")
        while True:
            remaining = fetch_unprocessed(1)
            if not remaining:
                break
            run(limit=BATCH_SIZE)
        show_stats()
    else:
        run(limit=BATCH_SIZE)
        show_stats()
