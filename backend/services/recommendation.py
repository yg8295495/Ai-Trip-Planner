import json
import os
from typing import List, Dict, Optional


class RecommendationEngine:
    """
    零成本内存推荐引擎
    在应用启动时将 mock_attractions.json 加载至内存，
    以 adcode 为 Key 的 Python 字典实现 O(1) 检索。
    """

    def __init__(self, json_path: str):
        """
        初始化推荐引擎，加载景点数据到内存。

        Args:
            json_path: mock_attractions.json 的路径
        """
        self._attractions_by_adcode: Dict[str, List[Dict]] = {}
        self._load_data(json_path)

    def _load_data(self, json_path: str) -> None:
        """从 JSON 文件加载景点数据，按 adcode 分组。"""
        if not os.path.exists(json_path):
            return

        with open(json_path, "r", encoding="utf-8") as f:
            attractions = json.load(f)

        for attraction in attractions:
            adcode = attraction.get("adcode")
            if adcode:
                if adcode not in self._attractions_by_adcode:
                    self._attractions_by_adcode[adcode] = []
                self._attractions_by_adcode[adcode].append(attraction)

    def get_attractions_by_adcodes(self, adcodes: List[str]) -> List[Dict]:
        """
        根据 adcode 列表获取景点信息。

        Args:
            adcodes: 行政区划代码列表

        Returns:
            匹配的景点列表，不存在的 adcode 静默忽略
        """
        results = []
        for adcode in adcodes:
            if adcode in self._attractions_by_adcode:
                results.extend(self._attractions_by_adcode[adcode])
        return results


# 全局单例 (应用启动时初始化)
_engine: Optional[RecommendationEngine] = None


def get_recommendation_engine() -> RecommendationEngine:
    """获取推荐引擎单例。"""
    global _engine
    if _engine is None:
        json_path = os.path.join(os.path.dirname(__file__), "..", "mock_attractions.json")
        _engine = RecommendationEngine(json_path)
    return _engine


def init_recommendation_engine(json_path: str) -> RecommendationEngine:
    """初始化推荐引擎 (用于测试或自定义路径)。"""
    global _engine
    _engine = RecommendationEngine(json_path)
    return _engine
