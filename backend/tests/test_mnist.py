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

    def test_runner_stream_architecture(self):
        """run_stream 返回的事件类型应符合预期（不实际加载 MNIST 数据以避免下载）。"""
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

