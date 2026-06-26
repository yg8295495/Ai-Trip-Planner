import pytest
import json
import os
from services.recommendation import RecommendationEngine


class TestRecommendationEngine:
    """Test zero-cost memory recommendation matching."""

    def setup_method(self):
        """Initialize engine with mock data for each test."""
        self.engine = RecommendationEngine(
            os.path.join(os.path.dirname(__file__), "..", "mock_attractions.json")
        )

    def test_get_attractions_by_adcodes_returns_matching(self):
        """Should return attractions matching the given adcodes."""
        results = self.engine.get_attractions_by_adcodes(["520400", "999999"])

        # 断言 A: 返回列表中包含且仅包含"黄果树瀑布"
        assert len(results) == 1
        assert results[0]["name"] == "黄果树瀑布"
        assert results[0]["adcode"] == "520400"

    def test_get_attractions_by_adcodes_ignores_nonexistent(self):
        """Non-existent adcodes should be silently ignored (no KeyError)."""
        results = self.engine.get_attractions_by_adcodes(["999999", "888888"])

        # 断言 B: 不存在的 adcode 不引发异常，返回空列表
        assert len(results) == 0

    def test_get_attractions_by_adcodes_multiple_matches(self):
        """Should return all matching attractions for multiple adcodes."""
        results = self.engine.get_attractions_by_adcodes(["520400", "110000"])

        assert len(results) == 2
        names = [r["name"] for r in results]
        assert "黄果树瀑布" in names
        assert "故宫博物院" in names

    def test_get_attractions_by_adcodes_empty_input(self):
        """Empty adcodes list should return empty list."""
        results = self.engine.get_attractions_by_adcodes([])
        assert results == []
