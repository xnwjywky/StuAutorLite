"""本地模型检测与无 Key 通路测试（LOCAL_MODEL_INTEGRATION_PLAN）。

覆盖：_is_local_url 地址判定、_parse_local_models 两种响应格式解析、
_build_llm 本地无 key 放行 / 公网强制 key、/api/agents/local-models 端点。
"""
from __future__ import annotations

import asyncio

import pytest


class TestIsLocalUrl:
    def test_local_hosts_are_local(self):
        from app.api.routes.agents import _is_local_url

        assert _is_local_url("http://127.0.0.1:11434/v1") is True
        assert _is_local_url("http://localhost:1234/v1") is True
        assert _is_local_url("http://0.0.0.0:8000/v1") is True

    def test_public_hosts_not_local(self):
        from app.api.routes.agents import _is_local_url

        assert _is_local_url("https://api.deepseek.com/v1") is False
        assert _is_local_url("https://api.openai.com/v1") is False
        assert _is_local_url("http://192.168.1.5:8000/v1") is False

    def test_none_and_empty(self):
        from app.api.routes.agents import _is_local_url

        assert _is_local_url(None) is False
        assert _is_local_url("") is False


class TestParseLocalModels:
    def test_ollama_native_format(self):
        from app.api.routes.agents import _parse_local_models

        data = {"models": [{"name": "qwen2.5:7b", "size": 1}, {"name": "llama3:8b", "size": 2}]}
        assert _parse_local_models(data) == ["qwen2.5:7b", "llama3:8b"]

    def test_openai_compatible_format(self):
        from app.api.routes.agents import _parse_local_models

        data = {"data": [{"id": "qwen2.5:7b"}, {"id": "deepseek-r1:14b"}]}
        assert _parse_local_models(data) == ["qwen2.5:7b", "deepseek-r1:14b"]

    def test_empty_and_malformed(self):
        from app.api.routes.agents import _parse_local_models

        assert _parse_local_models({}) == []
        assert _parse_local_models({"models": []}) == []
        assert _parse_local_models({"data": []}) == []
        assert _parse_local_models({"unexpected": "shape"}) == []
        assert _parse_local_models("not-a-dict") == []
        # 缺少 name/id 字段的条目应被跳过
        assert _parse_local_models({"models": [{}, {"name": "ok:1"}]}) == ["ok:1"]


class TestBuildLLMLocalNoKey:
    def test_local_url_without_key_builds_client(self):
        from app.api.routes.agents import _build_llm

        llm = _build_llm(
            x_api_key=None,
            x_api_base="http://127.0.0.1:11434/v1",
            x_api_model="qwen2.5:7b",
        )
        assert llm is not None
        assert llm.provider == "openai"
        assert llm.endpoint == "http://127.0.0.1:11434/v1/chat/completions"
        assert llm.model == "qwen2.5:7b"

    def test_public_url_without_key_returns_none(self):
        from app.api.routes.agents import _build_llm

        llm = _build_llm(
            x_api_key=None,
            x_api_base="https://api.deepseek.com/v1",
            x_api_model="deepseek-chat",
        )
        assert llm is None

    def test_public_url_with_key_builds_client(self):
        from app.api.routes.agents import _build_llm

        llm = _build_llm(
            x_api_key="sk-test",
            x_api_base="https://api.deepseek.com/anthropic",
            x_api_model="DeepSeek-V3",
        )
        assert llm is not None
        assert llm.provider == "openai"
        assert llm.model == "deepseek-v3"  # DeepSeek 模型名小写化
        assert llm.endpoint == "https://api.deepseek.com/v1/chat/completions"

    def test_missing_base_or_model_returns_none(self):
        from app.api.routes.agents import _build_llm

        assert _build_llm(x_api_key="k", x_api_base=None, x_api_model="m") is None
        assert _build_llm(x_api_key="k", x_api_base="http://127.0.0.1:11434/v1", x_api_model=None) is None


class TestLocalModelsEndpoint:
    async def test_returns_empty_when_no_service(self, monkeypatch):
        from app.api.routes import agents as routes

        async def fake_probe(client, ep):
            return None

        monkeypatch.setattr(routes, "_probe_local_service", fake_probe)
        resp = await routes.detect_local_models()
        assert resp == {"services": [], "found": False}

    async def test_returns_services_when_probe_finds(self, monkeypatch):
        from app.api.routes import agents as routes

        async def fake_probe(client, ep):
            return {"name": "Ollama", "v1_base": "http://127.0.0.1:11434/v1", "models": ["qwen2.5:7b"], "model_count": 1}

        monkeypatch.setattr(routes, "_probe_local_service", fake_probe)
        resp = await routes.detect_local_models()
        assert resp["found"] is True
        assert resp["services"][0]["name"] == "Ollama"
        assert resp["services"][0]["models"] == ["qwen2.5:7b"]

    def test_probe_returns_none_on_error(self):
        from app.api.routes.agents import _probe_local_service
        import httpx

        async def run():
            async with httpx.AsyncClient(timeout=0.01) as client:
                return await _probe_local_service(client, {"tags_url": "http://127.0.0.1:1/api/tags"})

        assert asyncio.run(run()) is None  # 端口 1 必拒绝连接，应静默返回 None


@pytest.mark.anyio
class TestLocalModelsAPI:
    async def test_endpoint_returns_200(self, client):
        resp = await client.get("/api/agents/local-models")
        assert resp.status_code == 200
        data = resp.json()
        assert "services" in data and "found" in data

    async def test_probe_endpoint_empty_url(self, client):
        resp = await client.post("/api/agents/local-models/probe", json={"url": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is False
        assert data["error"] == "地址为空"


class TestProbeCandidates:
    def test_bare_url_tries_both_paths(self):
        from app.api.routes.agents import _probe_candidates

        assert _probe_candidates("http://127.0.0.1:11435") == [
            "http://127.0.0.1:11435/api/tags",
            "http://127.0.0.1:11435/v1/models",
        ]

    def test_v1_url_tries_openai_first_then_ollama(self):
        from app.api.routes.agents import _probe_candidates

        assert _probe_candidates("http://127.0.0.1:11435/v1") == [
            "http://127.0.0.1:11435/v1/models",
            "http://127.0.0.1:11435/api/tags",
        ]

    def test_full_endpoint_used_as_is(self):
        from app.api.routes.agents import _probe_candidates

        assert _probe_candidates("http://x/api/tags") == ["http://x/api/tags"]
        assert _probe_candidates("http://x/v1/models") == ["http://x/v1/models"]


class TestProbeV1Base:
    def test_openai_path(self):
        from app.api.routes.agents import _probe_v1_base

        assert _probe_v1_base("http://127.0.0.1:11435/v1/models") == "http://127.0.0.1:11435/v1"

    def test_ollama_path(self):
        from app.api.routes.agents import _probe_v1_base

        assert _probe_v1_base("http://127.0.0.1:11435/api/tags") == "http://127.0.0.1:11435/v1"


class _FakeResp:
    def __init__(self, status_code: int, data: dict):
        self.status_code = status_code
        self._data = data

    def json(self) -> dict:
        return self._data


class _FakeAsyncClient:
    """httpx.AsyncClient 测试替身：按 URL 返回预设响应，未匹配则抛连接错误。"""

    def __init__(self, responses: dict[str, tuple[int, dict]]):
        self.responses = responses
        self.requests: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url: str):
        self.requests.append(url)
        if url not in self.responses:
            import httpx
            raise httpx.ConnectError(f"connection refused: {url}")
        status, data = self.responses[url]
        return _FakeResp(status, data)


class TestProbeCustomLocal:
    async def test_empty_url(self):
        from app.api.routes.agents import LocalProbeRequest, probe_custom_local

        resp = await probe_custom_local(LocalProbeRequest(url=""))
        assert resp["found"] is False
        assert resp["error"] == "地址为空"

    async def test_bad_scheme(self):
        from app.api.routes.agents import LocalProbeRequest, probe_custom_local

        resp = await probe_custom_local(LocalProbeRequest(url="ftp://127.0.0.1:11434"))
        assert resp["found"] is False
        assert "http/https" in resp["error"]

    async def test_unreachable(self):
        from app.api.routes.agents import LocalProbeRequest, probe_custom_local

        resp = await probe_custom_local(LocalProbeRequest(url="http://127.0.0.1:1"))
        assert resp["found"] is False
        assert "未" in resp["error"]

    async def test_ollama_hit(self, monkeypatch):
        from app.api.routes import agents as routes
        from app.api.routes.agents import LocalProbeRequest, probe_custom_local

        fake = _FakeAsyncClient({
            "http://127.0.0.1:11435/api/tags": (200, {"models": [{"name": "qwen2.5:7b"}, {"name": "llama3:8b"}]}),
        })
        monkeypatch.setattr(routes.httpx, "AsyncClient", lambda **kw: fake)
        resp = await probe_custom_local(LocalProbeRequest(url="http://127.0.0.1:11435"))
        assert resp["found"] is True
        svc = resp["services"][0]
        assert svc["v1_base"] == "http://127.0.0.1:11435/v1"
        assert svc["models"] == ["qwen2.5:7b", "llama3:8b"]
        assert svc["source_url"] == "http://127.0.0.1:11435/api/tags"

    async def test_openai_compatible_hit(self, monkeypatch):
        from app.api.routes import agents as routes
        from app.api.routes.agents import LocalProbeRequest, probe_custom_local

        # 裸地址：先试 /api/tags（404）再试 /v1/models（200）
        fake = _FakeAsyncClient({
            "http://192.168.1.20:8080/v1/models": (200, {"data": [{"id": "deepseek-r1:14b"}]}),
        })
        monkeypatch.setattr(routes.httpx, "AsyncClient", lambda **kw: fake)
        resp = await probe_custom_local(LocalProbeRequest(url="http://192.168.1.20:8080"))
        assert resp["found"] is True
        assert resp["services"][0]["v1_base"] == "http://192.168.1.20:8080/v1"
        assert fake.requests[0] == "http://192.168.1.20:8080/api/tags"  # 先试 Ollama 路径
        assert fake.requests[1] == "http://192.168.1.20:8080/v1/models"
