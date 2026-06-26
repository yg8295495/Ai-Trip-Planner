import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import os
import json

# Set test env
os.environ["GEMINI_API_KEY"] = "test-gemini-key"
os.environ["DEEPSEEK_API_KEY"] = "test-deepseek-key"

from main import app

client = TestClient(app)


class TestSystemPromptAssembly:
    """Test System Prompt assembly with attraction injection."""

    def test_system_prompt_injects_attractions(self):
        """
        断言 A: 传递给 LLM 的上下文中，成功注入了"黄果树瀑布"这一硬性背景知识。
        """
        with patch("main.call_gemini_api") as mock_gemini:
            mock_gemini.return_value = {"text": "response", "envelope": {}}

            response = client.post("/api/chat", json={
                "provider": "gemini",
                "user_message": "推荐一下附近的吃的",
                "chat_history": [],
                "adcodes": ["520400"],  # 黄果树瀑布的 adcode
            })

            assert response.status_code == 200

            # 检查传递给 LLM 的 System Prompt 中是否包含景点信息
            call_args = mock_gemini.call_args
            # call_gemini_api(message, chat_history, system_prompt)
            system_prompt = call_args[0][2]  # 第三个参数是 system_prompt

            # 验证景点信息被注入到 System Prompt 中
            assert "黄果树瀑布" in system_prompt

    def test_no_external_api_calls(self):
        """
        断言 B: 整个过程中没有发生任何外部的高德 API 或天气 API 的阻断式网络请求。
        """
        with patch("main.call_gemini_api") as mock_gemini, \
             patch("requests.post") as mock_requests_post:
            mock_gemini.return_value = {"text": "response", "envelope": {}}

            response = client.post("/api/chat", json={
                "provider": "gemini",
                "user_message": "推荐景点",
                "chat_history": [],
                "adcodes": ["520400"],
            })

            assert response.status_code == 200

            # 验证没有调用高德 API 或天气 API
            for call in mock_requests_post.call_args_list:
                url = call[0][0] if call[0] else ""
                assert "amap.com" not in url
                assert "weather" not in url.lower()
