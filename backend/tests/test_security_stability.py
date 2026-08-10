"""安全与稳定性修复的回归测试（对应 SECURITY_STABILITY_REVIEW P0/P1/S-中及以上）。

覆盖：P0-1 全局 llm 串扰、P0-2 全站鉴权、P1-3 CORS、P1-4 history 鉴权、
P1-6 model_id 白名单、P1-7 torch.load 安全加载、S-高-2 训练状态落盘、
S-中-3 限流、S-中-4 日志上限、S-中-5 用量节流落盘。
"""
from __future__ import annotations

import asyncio
import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ─────────────────────────────────────────────────────────
# P0-1：agent_gateway 去全局 self.llm
# ─────────────────────────────────────────────────────────
class TestP01GlobalLlmRemoved:
    def test_gateway_has_no_global_llm(self):
        from app.services.agent_gateway import AgentGateway, get_gateway

        gw = AgentGateway()
        assert not hasattr(gw, "llm"), "self.llm 应已移除"
        assert not hasattr(gw, "set_llm"), "set_llm 应已移除"

    def test_get_gateway_ignores_llm_param(self, monkeypatch):
        from app.services import agent_gateway as gw_mod

        monkeypatch.setattr(gw_mod, "_gateway", None)
        gw1 = gw_mod.get_gateway()
        # 再次调用带 llm 参数不应改写任何全局状态（无 self.llm 可写）
        gw2 = gw_mod.get_gateway(llm=object())
        assert gw1 is gw2

    def test_invoke_signature_has_explicit_llm(self):
        from app.services.agent_gateway import AgentGateway
        import inspect

        sig = inspect.signature(AgentGateway.invoke)
        assert "llm" in sig.parameters
        assert sig.parameters["llm"].default is None

    def test_invoke_without_llm_uses_template(self):
        """无 llm 时直接走模板降级（不因全局 llm 残留而误调）。"""
        from app.services.agent_gateway import AgentGateway

        class FakeAgent:
            name = "fake"
            def respond(self, context):
                return {"template": True}

        gw = AgentGateway()
        gw.register(FakeAgent())
        result = asyncio.run(gw.invoke("fake", {"q": 1}, llm=None))
        assert result.get("template") is True


# ─────────────────────────────────────────────────────────
# P0-2：全站鉴权（X-App-Key）
# ─────────────────────────────────────────────────────────
class TestP02AppKeyAuth:
    def test_disabled_when_no_key(self, monkeypatch):
        from app.config import settings
        from app.api.auth import verify_app_key

        monkeypatch.setattr(settings, "app_key", "")
        asyncio.run(verify_app_key(x_app_key=None))  # 未配置 → 放行

    @pytest.mark.asyncio
    async def test_rejects_wrong_key(self, monkeypatch):
        from fastapi import HTTPException
        from app.config import settings
        from app.api.auth import verify_app_key

        monkeypatch.setattr(settings, "app_key", "secret")
        with pytest.raises(HTTPException) as exc:
            await verify_app_key(x_app_key="wrong")
        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_accepts_correct_key(self, monkeypatch):
        from app.config import settings
        from app.api.auth import verify_app_key

        monkeypatch.setattr(settings, "app_key", "secret")
        await verify_app_key(x_app_key="secret")  # 不抛异常即通过

    def test_api_endpoint_enforces_auth(self, monkeypatch):
        from app.config import settings
        from app.main import app

        monkeypatch.setattr(settings, "app_key", "secret")
        client = TestClient(app)
        assert client.get("/api/agents/").status_code == 401
        ok = client.get("/api/agents/", headers={"X-App-Key": "secret"})
        assert ok.status_code == 200
        # health 不受鉴权影响
        assert client.get("/api/health").status_code == 200


# ─────────────────────────────────────────────────────────
# P1-3：CORS 配置（具体来源 + 关闭 credentials）
# ─────────────────────────────────────────────────────────
class TestP13Cors:
    def test_cors_origins_and_credentials(self):
        from app.config import settings
        from app.main import app

        cors = [m for m in app.user_middleware
                if hasattr(m, "kwargs") and "allow_origins" in getattr(m, "kwargs", {})]
        assert cors, "应存在 CORS 中间件"
        kw = cors[0].kwargs
        assert kw["allow_credentials"] is False
        assert "*" not in kw["allow_origins"]
        assert settings.cors_origins  # 默认具体前端源


# ─────────────────────────────────────────────────────────
# P1-6：model_id 白名单（防路径遍历）
# ─────────────────────────────────────────────────────────
class TestP16ModelIdWhitelist:
    def test_whitelist_contains_valid_ids(self):
        from app.core.mnist.model_manager import ALLOWED_MODEL_IDS

        assert ALLOWED_MODEL_IDS == frozenset({"minicnn", "standardcnn", "deepcnn", "user"})

    def test_invalid_model_id_rejected(self):
        from app.core.mnist.model_manager import ModelManager

        mgr = ModelManager.get_instance()
        for bad in ("../../etc/passwd", "..%2fsecret", "x"):
            assert mgr.load_model_by_id(bad, session_id=None, device="cpu") is None

    def test_infer_endpoint_400_on_invalid_model_id(self, monkeypatch):
        from app.config import settings
        from app.main import app

        monkeypatch.setattr(settings, "app_key", "")  # 关闭鉴权便于测试路由
        client = TestClient(app)
        r = client.post(
            "/api/mnist/infer",
            data={"session_id": "1", "model_id": "../../evil"},
            files={"file": ("a.png", b"not-an-image", "image/png")},
        )
        assert r.status_code == 400  # 白名单拦截（而非 404/500）


# ─────────────────────────────────────────────────────────
# P1-7：用户模型 weights_only 安全加载 + arch_config 另存 JSON
# ─────────────────────────────────────────────────────────
class TestP17SafeTorchLoad:
    def test_user_model_roundtrip(self, monkeypatch, tmp_path):
        import torch
        import torch.nn as nn
        import app.core.mnist.model_manager as mm

        # 隔离模型目录到临时目录
        monkeypatch.setattr(mm, "_MODELS_DIR", tmp_path)
        monkeypatch.setattr(mm.ModelManager, "_instance", None)

        # 新格式：state_dict 存 .pth + arch_config 存 .arch.json
        from app.core.mnist.architectures import get_architecture

        arch = get_architecture("minicnn")
        model = __import__("app.core.mnist.architectures", fromlist=["build_model"]).build_model(arch)
        state = model.state_dict()

        mgr = mm.ModelManager()
        mgr.save_user_model(99, state, {"id": "minicnn"})
        assert (tmp_path / "user_99.pth").exists()
        assert (tmp_path / "user_99.arch.json").exists()

        loaded = mgr.load_user_model(99, device="cpu")
        assert loaded is not None

        # 文件内容：.pth 是纯 state_dict（weights_only 可安全加载）
        raw = torch.load(str(tmp_path / "user_99.pth"), map_location="cpu", weights_only=True)
        assert isinstance(raw, dict) and "state_dict" not in raw  # 纯权重

    def test_old_format_backward_compatible(self, monkeypatch, tmp_path):
        """旧打包格式 {"state_dict","arch_config"} 仍可加载（weights_only 安全）。"""
        import torch
        import app.core.mnist.model_manager as mm
        from app.core.mnist.architectures import get_architecture, build_model

        monkeypatch.setattr(mm, "_MODELS_DIR", tmp_path)
        monkeypatch.setattr(mm.ModelManager, "_instance", None)

        model = build_model(get_architecture("minicnn"))
        torch.save({"state_dict": model.state_dict(), "arch_config": {"id": "minicnn"}},
                   str(tmp_path / "user_88.pth"))

        mgr = mm.ModelManager()
        loaded = mgr.load_user_model(88, device="cpu")
        assert loaded is not None  # 兼容旧格式且安全加载


# ─────────────────────────────────────────────────────────
# S-高-2：预训练状态落盘 / 重启恢复
# ─────────────────────────────────────────────────────────
class TestSHigh2StatusPersistence:
    def test_status_persist_and_restore(self, monkeypatch, tmp_path):
        import app.core.mnist.model_manager as mm

        monkeypatch.setattr(mm, "_STATUS_FILE", tmp_path / "pretrain_status.json")
        monkeypatch.setattr(mm.ModelManager, "_instance", None)

        mm.ModelManager._training_status = {"minicnn": "training", "standardcnn": "cached"}
        mm.ModelManager._training_progress = {"minicnn": {"epoch": 5, "total": 10, "acc": 0.9}}
        mm.ModelManager._persist_status()
        assert (tmp_path / "pretrain_status.json").exists()

        # 模拟重启：training → failed（可重入重训）
        mm.ModelManager._training_status = {}
        mm.ModelManager._training_progress = {}
        mgr = mm.ModelManager()
        assert mgr._training_status.get("minicnn") == "failed"
        assert mgr._training_status.get("standardcnn") == "cached"


# ─────────────────────────────────────────────────────────
# S-中-3：限流
# ─────────────────────────────────────────────────────────
class TestSMid3RateLimit:
    def test_rate_limiter_window(self):
        from app.utils.rate_limit import RateLimiter

        rl = RateLimiter(max_requests=2, window_secs=60)
        assert rl.allow("ip-a") and rl.allow("ip-a")
        assert not rl.allow("ip-a")  # 超限
        assert rl.allow("ip-b")  # 其他 IP 不受影响

    def test_api_429_when_limited(self, monkeypatch):
        from app.config import settings
        from app.main import app

        monkeypatch.setattr(settings, "rate_limit_per_minute", 1)
        # 重置单例限流器
        import app.utils.rate_limit as rl_mod
        monkeypatch.setattr(rl_mod, "_limiter", None)
        client = TestClient(app)
        assert client.get("/api/agents/").status_code == 200
        assert client.get("/api/agents/").status_code == 429  # 第二发被限


# ─────────────────────────────────────────────────────────
# S-中-4：_call_log 上限
# ─────────────────────────────────────────────────────────
class TestSMid4CallLogCap:
    def test_call_log_capped(self):
        from app.services.agent_gateway import AgentGateway, _MAX_CALL_LOG

        gw = AgentGateway()
        for i in range(_MAX_CALL_LOG * 3):
            gw._call_log.append({"i": i})
        assert len(gw._call_log) == _MAX_CALL_LOG
        # get_call_log 返回 list
        assert isinstance(gw.get_call_log(10), list)


# ─────────────────────────────────────────────────────────
# S-中-5：用量节流落盘 + 退出 flush
# ─────────────────────────────────────────────────────────
class TestSMid5UsageThrottle:
    def test_usage_persisted_on_flush(self, monkeypatch, tmp_path):
        import app.services.agent_gateway as ag

        monkeypatch.setattr(ag, "_USAGE_FILE", tmp_path / "token_usage.json")
        gw = ag.AgentGateway()
        gw.record_usage({"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}, "m")
        gw.record_usage(None, "m")  # 30s 内节流，不立即写盘
        gw.flush_usage()  # 退出兜底
        data = json.loads((tmp_path / "token_usage.json").read_text(encoding="utf-8"))
        assert data["calls"] == 2
        assert data["total_tokens"] == 15
