"""
携程数据入库脚本
- 直接用携程 poi_id 作为主键
- 不需要 OSM 匹配
- 写入 poi_details + poi_images
"""
import sqlite3
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "local_travel.db")
ATTR_FILE = os.path.join(BASE_DIR, "data", "ctrip_attractions.json")


def import_to_db(attractions, dry_run=False):
    """导入数据到数据库"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    imported = 0
    skipped = 0

    for attr in attractions:
        poi_id = attr.get("poi_id", "")
        if not poi_id:
            skipped += 1
            continue

        if not dry_run:
            # 写入 poi_details，直接用 poi_id 作为主键
            cursor.execute("""
                INSERT OR REPLACE INTO poi_details
                (osm_id, gaode_name, ticket, opening_hours, phone, review_total, review_good_rate, summary_text, lat, lng)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"ctrip_{poi_id}",
                attr["name"],
                "免费" if attr.get("is_free") else "",
                attr.get("open_status", ""),
                "",
                attr.get("review_count", 0),
                attr.get("score", 0) / 5.0 if attr.get("score") else None,
                None,
                attr.get("lat"),
                attr.get("lng"),
            ))

            # 写入封面图到 poi_images
            cover = attr.get("cover_image", "")
            if cover:
                cursor.execute("""
                    INSERT INTO poi_images (osm_id, url, source, is_cover)
                    VALUES (?, ?, 'ctrip', 1)
                """, (f"ctrip_{poi_id}", cover))

        imported += 1

    if not dry_run:
        conn.commit()
    conn.close()

    return imported, skipped


def main():
    dry_run = "--dry-run" in __import__("sys").argv

    attractions = json.load(open(ATTR_FILE)) if os.path.exists(ATTR_FILE) else []
    print(f"携程景点: {len(attractions)} 条")

    imported, skipped = import_to_db(attractions, dry_run=dry_run)
    print(f"成功入库: {imported} 条")
    print(f"跳过: {skipped} 条")


if __name__ == "__main__":
    main()
