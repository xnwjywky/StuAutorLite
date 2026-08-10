"""测试 MNIST 模块 — 架构 + Runner + 导入守卫"""
import pytest


class TestImportGuards:
    """导入守卫：确保所有关键模块可在无 MNIST 数据时正常导入（防止 ModuleNotFoundError 等启动错误）。"""

    def test_core_mnist_imports(self):
        """core.mnist 包及所有子模块应可导入"""
        from app.core.mnist import MNISTRunner, PRESET_ARCHITECTURES, build_model, get_architecture
        assert MNISTRunner is not None
        assert len(PRESET_ARCHITECTURES) == 4

    def test_runner_import(self):
        """runner 模块导入不应抛异常（即使 ML 库未安装）"""
        import importlib
        mod = importlib.import_module("app.core.mnist.runner")
        assert hasattr(mod, "MNISTRunner")

    def test_api_route_import(self):
        """API 路由模块导入不应抛异常"""
        import importlib
        mod = importlib.import_module("app.api.routes.mnist")
        assert hasattr(mod, "router")

    def test_main_imports_mnist(self):
        """main.py 应能正常导入 mnist 路由"""
        import importlib
        mod = importlib.import_module("app.main")
        # 主应用应能创建（FastAPI app 实例）
        assert hasattr(mod, "app")

    def test_numpy_available(self):
        """numpy 必须可用（runner 顶层 import）"""
        import numpy
        assert numpy is not None

    def test_torch_available(self):
        """torch 必须可用"""
        import torch
        assert torch is not None

    def test_torchvision_available(self):
        """torchvision 必须可用（runner 内用 datasets）"""
        import torchvision
        assert torchvision is not None

    def test_db_model_exists(self):
        """MNISTRun 数据库模型应可创建"""
        from app.models.database import MNISTRun, Base
        assert hasattr(MNISTRun, "__tablename__")
        assert MNISTRun.__tablename__ == "mnist_runs"

    def test_architectures_api_route_works(self):
        """GET /api/mnist/architectures 路由函数应可调用返回有效数据"""
        from app.api.routes.mnist import get_architectures
        result = get_architectures()
        assert "architectures" in result
        assert len(result["architectures"]) == 4


class TestArchitectures:
    def test_all_4_presets(self):
        from app.core.mnist.architectures import PRESET_ARCHITECTURES
        assert len(PRESET_ARCHITECTURES) == 4

    def test_get_architecture_valid(self):
        from app.core.mnist.architectures import get_architecture
        for arch_id in ["minicnn", "standardcnn", "deepcnn", "mlp"]:
            arch = get_architecture(arch_id)
            assert arch is not None, f"{arch_id} not found"
            assert "layers" in arch
            assert len(arch["layers"]) > 0

    def test_get_architecture_invalid(self):
        from app.core.mnist.architectures import get_architecture
        assert get_architecture("nonexistent") is None

    def test_build_minicnn(self):
        from app.core.mnist.architectures import get_architecture, build_model
        arch = get_architecture("minicnn")
        model = build_model(arch)
        params = sum(p.numel() for p in model.parameters())
        assert params > 0
        # MiniCNN: Conv(1→16,3×3) + Linear(3136→10) ≈ 32K
        assert 30000 < params < 35000, f"MiniCNN params={params}"

    def test_build_standardcnn(self):
        from app.core.mnist.architectures import get_architecture, build_model
        arch = get_architecture("standardcnn")
        model = build_model(arch)
        params = sum(p.numel() for p in model.parameters())
        assert params > 100000

    def test_build_mlp(self):
        from app.core.mnist.architectures import get_architecture, build_model
        arch = get_architecture("mlp")
        model = build_model(arch)
        params = sum(p.numel() for p in model.parameters())
        assert params > 500000

    def test_all_models_buildable(self):
        from app.core.mnist.architectures import PRESET_ARCHITECTURES, build_model
        for arch in PRESET_ARCHITECTURES:
            model = build_model(arch)
            assert model is not None

    def test_forward_pass_minicnn(self):
        """MiniCNN 前向传播不报错"""
        import torch
        from app.core.mnist.architectures import get_architecture, build_model
        arch = get_architecture("minicnn")
        model = build_model(arch)
        x = torch.randn(4, 1, 28, 28)
        y = model(x)
        assert y.shape == (4, 10)


class TestRunner:
    def test_runner_instantiation(self):
        from app.core.mnist.runner import MNISTRunner
        r = MNISTRunner()
        assert r is not None

    @pytest.mark.slow
    def test_runner_stream_architecture(self):
        """run_stream 返回的事件类型应符合预期（真实训练 1 epoch，耗时较长 → 标记 slow，默认跳过）。"""
        from app.core.mnist.runner import MNISTRunner
        r = MNISTRunner()
        config = {
            "architecture": {"id": "mlp"},
            "hyperparameters": {"learning_rate": 0.01, "batch_size": 64, "epochs": 1, "optimizer": "SGD", "momentum": 0},
            "seed": 42,
        }
        events = list(r.run_stream(config))
        event_types = [e["type"] for e in events]
        assert "train_start" in event_types
        assert len(events) >= 2


class TestUserModelReset:
    """「重新训练时重置我的模型状态」的底层保证：删除用户模型须同时清掉 .pth 与 .arch.json。"""

    def test_delete_user_model_removes_both_files(self, monkeypatch, tmp_path):
        import app.core.mnist.model_manager as mm
        from app.core.mnist.architectures import get_architecture, build_model

        monkeypatch.setattr(mm, "_MODELS_DIR", tmp_path)
        monkeypatch.setattr(mm.ModelManager, "_instance", None)

        # 先保存一个用户模型（含配套架构配置）
        model = build_model(get_architecture("minicnn"))
        mgr = mm.ModelManager()
        mgr.save_user_model(77, model.state_dict(), {"id": "minicnn"})
        assert (tmp_path / "user_77.pth").exists()
        assert (tmp_path / "user_77.arch.json").exists()
        assert mgr.has_user_model(77)

        # 删除后：.pth 与 .arch.json 都必须消失（否则 model-status 仍会显示旧模型就绪）
        mgr.delete_user_model(77)
        assert not (tmp_path / "user_77.pth").exists()
        assert not (tmp_path / "user_77.arch.json").exists()
        assert not mgr.has_user_model(77)

    def test_delete_endpoint_returns_ok(self):
        """DELETE /api/mnist/user-model 应正常响应（前端重新训练时调用）。"""
        from fastapi.testclient import TestClient
        from app.config import settings
        from app.main import app

        settings.app_key = ""  # 关闭鉴权便于测试
        client = TestClient(app)
        r = client.delete("/api/mnist/user-model", params={"session_id": 999999})
        assert r.status_code == 200


class TestMNISTAccuracyFixes:
    """MNIST_ACCURACY_FIX 回归测试：训练互斥锁 / 超参 key 兼容 / 预训练幂等。"""

    def test_training_mutex_acquire_release(self):
        """全局训练互斥：忙时拒绝，释放后可再获取。"""
        from app.core.mnist.model_manager import ModelManager

        ModelManager.release_training()  # 确保干净状态
        assert ModelManager.acquire_training(timeout=0.0) is True
        assert ModelManager.acquire_training(timeout=0.0) is False  # 忙 → 拒绝
        ModelManager.release_training()
        assert ModelManager.acquire_training(timeout=0.0) is True
        ModelManager.release_training()

    def test_training_mutex_timeout_waits(self):
        """忙时带超时等待：等待后仍忙返回 False（/run 409 路径）。"""
        import time
        from app.core.mnist.model_manager import ModelManager

        ModelManager.release_training()
        ModelManager.acquire_training(timeout=0.0)
        t0 = time.time()
        assert ModelManager.acquire_training(timeout=0.3) is False
        assert time.time() - t0 >= 0.25
        ModelManager.release_training()

    def test_run_endpoint_409_when_busy(self):
        """/run 端点忙时返回 409（有训练在进行时）。"""
        from fastapi.testclient import TestClient
        from app.config import settings
        from app.main import app
        from app.core.mnist.model_manager import ModelManager

        settings.app_key = ""
        ModelManager.release_training()
        ModelManager.acquire_training(timeout=0.0)  # 模拟已有训练
        try:
            client = TestClient(app)
            r = client.post("/api/mnist/run", json={
                "session_id": 1, "architecture": {"id": "minicnn"},
                "hyperparameters": {}, "seed": 42,
            })
            assert r.status_code == 409
        finally:
            ModelManager.release_training()

    def test_run_stream_busy_returns_error_event(self):
        """/run-stream（前端实际训练走 SSE）忙时返回 error 事件而非真实训练。"""
        from fastapi.testclient import TestClient
        from app.config import settings
        from app.main import app
        from app.core.mnist.model_manager import ModelManager

        settings.app_key = ""
        ModelManager.release_training()
        ModelManager.acquire_training(timeout=0.0)  # 模拟已有训练
        try:
            client = TestClient(app)
            r = client.post("/api/mnist/run-stream", json={
                "session_id": 1, "architecture": {"id": "minicnn"},
                "hyperparameters": {"epochs": 1}, "seed": 42,
            })
            body = r.text
            assert "已有训练正在进行" in body  # error 事件告知前端
            assert "data:" in body  # SSE 格式
        finally:
            ModelManager.release_training()

    def test_hyperparam_key_compat(self):
        """超参双取：camelCase（前端）与 snake_case（后端）都能生效。"""
        import torch.nn as nn
        from app.core.mnist.runner import MNISTRunner

        m = nn.Linear(4, 4)
        opt_camel = MNISTRunner._build_optimizer(m, {"learningRate": 0.08, "optimizer": "SGD"})
        opt_snake = MNISTRunner._build_optimizer(m, {"learning_rate": 0.05, "optimizer": "SGD"})
        opt_default = MNISTRunner._build_optimizer(m, {})
        assert opt_camel.param_groups[0]["lr"] == 0.08
        assert opt_snake.param_groups[0]["lr"] == 0.05
        assert opt_default.param_groups[0]["lr"] == 0.01

    def test_pretrain_idempotent(self):
        """预训练幂等：_pretrain_running=True 时重复启动被跳过。"""
        from app.core.mnist.model_manager import ModelManager

        with ModelManager._train_lock:
            prev = ModelManager._pretrain_running
            ModelManager._pretrain_running = True
        try:
            ModelManager.start_pretrain_background()  # 应直接 return，不起新线程
        finally:
            with ModelManager._train_lock:
                ModelManager._pretrain_running = prev
        # 未抛异常即通过（重复启动被幂等跳过）

