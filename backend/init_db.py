"""
OSM POI 数据导入脚本
将 31 个省份的 Overpass API JSON 文件清洗并导入 SQLite
"""
import sqlite3
import json
import os
import time
import glob

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "osm")
DB_PATH = os.path.join(os.path.dirname(__file__), "local_travel.db")

BATCH_SIZE = 5000

INSERT_QUERY = """
INSERT OR IGNORE INTO local_pois (osm_id, name, lat, lon, primary_tag, sub_tag, raw_tags)
VALUES (?, ?, ?, ?, ?, ?, ?)
"""

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS local_pois (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    osm_id TEXT UNIQUE,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    primary_tag TEXT,
    sub_tag TEXT,
    raw_tags TEXT
);
"""

CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_position ON local_pois (lat, lon);",
    "CREATE INDEX IF NOT EXISTS idx_tags ON local_pois (primary_tag, sub_tag);",
]


def init_database():
    start_time = time.time()
    print("=" * 50)
    print("  OSM POI 数据入库")
    print("=" * 50)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(CREATE_TABLE)
    for idx_sql in CREATE_INDEXES:
        cursor.execute(idx_sql)
    conn.commit()
    print(f"[1/3] 数据库就绪: {DB_PATH}")

    files = sorted(glob.glob(os.path.join(RAW_DIR, "*.json")))
    print(f"[2/3] 发现 {len(files)} 个省份文件")

    total_inserted = 0
    total_skipped = 0

    for file_path in files:
        province = os.path.basename(file_path).replace("_2026-06-19.json", "")
        batch_data = []

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        elements = data.get("elements", [])
        file_inserted = 0

        for node in elements:
            if node.get("type") != "node":
                continue

            tags = node.get("tags", {})
            name = tags.get("name") or tags.get("name:zh")
            if not name:
                total_skipped += 1
                continue

            osm_id = str(node.get("id"))
            lat = float(node.get("lat", 0))
            lon = float(node.get("lon", 0))
            if lat == 0 or lon == 0:
                total_skipped += 1
                continue

            primary_tag = ""
            sub_tag = ""
            for key in ["tourism", "leisure", "amenity", "historic"]:
                if key in tags:
                    primary_tag = key
                    sub_tag = tags[key]
                    break

            batch_data.append((
                osm_id, name, lat, lon,
                primary_tag, sub_tag,
                json.dumps(tags, ensure_ascii=False)
            ))

            if len(batch_data) >= BATCH_SIZE:
                cursor.executemany(INSERT_QUERY, batch_data)
                conn.commit()
                file_inserted += len(batch_data)
                batch_data = []

        if batch_data:
            cursor.executemany(INSERT_QUERY, batch_data)
            conn.commit()
            file_inserted += len(batch_data)

        total_inserted += file_inserted
        print(f"  {province}: {file_inserted} 条入库 (原始 {len(elements)} 条)")

    cursor.execute("SELECT COUNT(*) FROM local_pois;")
    final_count = cursor.fetchone()[0]
    conn.close()

    elapsed = time.time() - start_time
    print()
    print(f"[3/3] 入库完成!")
    print(f"  总计有效 POI: {final_count:,} 条")
    print(f"  跳过无名节点: {total_skipped:,} 条")
    print(f"  耗时: {elapsed:.1f} 秒")
    print(f"  数据库大小: {os.path.getsize(DB_PATH) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    init_database()
