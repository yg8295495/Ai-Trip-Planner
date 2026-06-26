import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import os
import json
import requests
from dotenv import load_dotenv

# Load real env vars from .env FIRST
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
REAL_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
REAL_DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# Now set test env for routing tests
os.environ["GEMINI_API_KEY"] = "test-gemini-key"
os.environ["DEEPSEEK_API_KEY"] = "test-deepseek-key"

from main import app

client = TestClient(app)


class TestProviderRouting:
    """Test that requests are routed to the correct provider."""

    def test_gemini_routes_to_api_when_key_exists(self):
        """Gemini provider with API key should call API, not CLI."""
        with patch("main.call_gemini_api") as mock_gemini, \
             patch("main.call_local_cli") as mock_cli:
            mock_gemini.return_value = {"text": "gemini response", "envelope": {}}

            response = client.post("/api/chat", json={
                "provider": "gemini",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            assert response.status_code == 200
            mock_gemini.assert_called_once()
            mock_cli.assert_not_called()

    def test_deepseek_routes_to_api_when_key_exists(self):
        """DeepSeek provider with API key should call API, not CLI."""
        with patch("main.call_deepseek_api") as mock_deepseek, \
             patch("main.call_local_cli") as mock_cli:
            mock_deepseek.return_value = {"text": "deepseek response", "envelope": {}}

            response = client.post("/api/chat", json={
                "provider": "deepseek",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            assert response.status_code == 200
            mock_deepseek.assert_called_once()
            mock_cli.assert_not_called()

    def test_codebuddy_falls_back_to_cli(self):
        """codebuddy provider should always use CLI."""
        with patch("main.call_local_cli") as mock_cli, \
             patch("main.call_gemini_api") as mock_gemini, \
             patch("main.call_deepseek_api") as mock_deepseek:
            mock_cli.return_value = {"text": "cli response"}

            response = client.post("/api/chat", json={
                "provider": "codebuddy",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            assert response.status_code == 200
            mock_cli.assert_called_once_with("codebuddy", "hello")
            mock_gemini.assert_not_called()
            mock_deepseek.assert_not_called()

    def test_mimo_falls_back_to_cli(self):
        """mimo provider should always use CLI."""
        with patch("main.call_local_cli") as mock_cli:
            mock_cli.return_value = {"text": "cli response"}

            response = client.post("/api/chat", json={
                "provider": "mimo",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            assert response.status_code == 200
            mock_cli.assert_called_once_with("mimo", "hello")

    def test_unknown_provider_falls_back_to_cli(self):
        """Unknown provider should fall back to CLI."""
        with patch("main.call_local_cli") as mock_cli:
            mock_cli.return_value = {"text": "cli response"}

            response = client.post("/api/chat", json={
                "provider": "unknown",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            assert response.status_code == 200
            mock_cli.assert_called_once()


class TestResponseFormat:
    """Test that API responses have the correct format."""

    def test_response_contains_text_field(self):
        """All responses must contain a 'text' field."""
        with patch("main.call_local_cli") as mock_cli:
            mock_cli.return_value = {"text": "response text"}

            response = client.post("/api/chat", json={
                "provider": "codebuddy",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            data = response.json()
            assert "text" in data

    def test_response_contains_envelope_field(self):
        """Responses may contain an 'envelope' field for structured updates."""
        with patch("main.call_local_cli") as mock_cli:
            mock_cli.return_value = {"text": "response", "envelope": {"status": "planning"}}

            response = client.post("/api/chat", json={
                "provider": "codebuddy",
                "user_message": "hello",
                "chat_history": [],
                "trip_data": {},
            })

            data = response.json()
            assert "envelope" in data


class TestContinueSession:
    """Test continue_session flag for provider switching."""

    def test_continue_session_injects_system_prompt(self):
        """When continue_session=True, system prompt should be injected into chat_history."""
        with patch("main.call_gemini_api") as mock_gemini:
            mock_gemini.return_value = {"text": "response", "envelope": {}}

            client.post("/api/chat", json={
                "provider": "gemini",
                "user_message": "hello",
                "chat_history": [{"role": "user", "text": "previous message"}],
                "trip_data": {},
                "continue_session": True,
            })

            # Check that the chat_history passed to gemini has the system prompt
            call_args = mock_gemini.call_args
            history = call_args[0][1]  # second positional arg
            assert any("接手" in msg.get("text", "") for msg in history)

    def test_continue_session_false_no_injection(self):
        """When continue_session=False, no system prompt injection."""
        with patch("main.call_gemini_api") as mock_gemini:
            mock_gemini.return_value = {"text": "response", "envelope": {}}

            client.post("/api/chat", json={
                "provider": "gemini",
                "user_message": "hello",
                "chat_history": [{"role": "user", "text": "previous message"}],
                "trip_data": {},
                "continue_session": False,
            })

            call_args = mock_gemini.call_args
            history = call_args[0][1]
            assert len(history) == 1  # only the original message
            assert history[0]["text"] == "previous message"


class TestGeminiAPI:
    """Test Gemini API integration (requires real API key)."""

    @pytest.mark.skipif(
        not REAL_GEMINI_KEY or REAL_GEMINI_KEY == "test-gemini-key",
        reason="No real GEMINI_API_KEY set in .env"
    )
    def test_gemini_api_returns_response(self):
        """Real Gemini API call should return a valid response."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={REAL_GEMINI_KEY}"
        payload = {"contents": [{"parts": [{"text": "你好，请用一句话介绍北京"}]}]}
        resp = requests.post(url, json=payload, timeout=30)

        if resp.status_code == 429:
            pytest.skip("Gemini API quota exhausted")
        resp.raise_for_status()
        data = resp.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        assert len(text) > 0


class TestDeepSeekAPI:
    """Test DeepSeek API integration (requires real API key)."""

    @pytest.mark.skipif(
        not REAL_DEEPSEEK_KEY or REAL_DEEPSEEK_KEY == "test-deepseek-key",
        reason="No real DEEPSEEK_API_KEY set in .env"
    )
    def test_deepseek_api_returns_response(self):
        """Real DeepSeek API call should return a valid response."""
        import requests as req
        headers = {"Authorization": f"Bearer {REAL_DEEPSEEK_KEY}", "Content-Type": "application/json"}
        payload = {"model": "deepseek-v4-flash", "messages": [{"role": "user", "content": "你好，请用一句话介绍上海"}]}
        resp = req.post("https://api.deepseek.com/chat/completions", json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        assert len(text) > 0


class TestCodebuddyCLI:
    """Test codebuddy CLI integration (requires local installation)."""

    @pytest.mark.skipif(
        not os.path.exists("/Users/LiYuan/.nvm/versions/node/v24.15.0/bin/codebuddy"),
        reason="codebuddy not installed"
    )
    def test_codebuddy_cli_returns_response(self):
        """Real codebuddy CLI call should return a valid response."""
        response = client.post("/api/chat", json={
            "provider": "codebuddy",
            "user_message": "你好，用一句话回复",
            "chat_history": [],
            "trip_data": {},
        })

        assert response.status_code == 200
        data = response.json()
        assert "text" in data
        assert len(data["text"]) > 0
