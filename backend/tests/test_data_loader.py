"""MNIST 数据准备非阻塞化测试（MNIST_DOWNLOAD_NONBLOCKING_PLAN）。

覆盖：data_loader 状态机（就绪判定 / 下载状态流转 / 失败重试）、
mnist 路由的 503 容错（/run、/run-stream、/infer 数据未就绪时不占训练锁）。
"""
from __future__ import annotations

import asyncio

import pytest


@pytest.fixture(autouse=True)
def _reset_status():
    """每个用例前重置 data_loader 全局状态，避免用例间串扰。"""
    from app.core.mnist import data_loader as dl

    dl._status.update(ready=False, downloading=False, error=None, progress="", retry_count=0)
    yield
    dl._status.update(ready=False, downloading=False, error=None, progress="", retry_count=0)


class TestFilesReady:
    def test_missing_files_not_ready(self, monkeypatch, tmp_path):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "DATA_DIR", tmp_path)  # 空目录 → 未就绪
        assert dl._files_ready() is False

    def test_partial_files_not_ready(self, monkeypatch, tmp_path):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "DATA_DIR", tmp_path)
        (tmp_path / "train-images-idx3-ubyte").write_bytes(b"x" * dl._EXPECTED_FILES["train-images-idx3-ubyte"])
        assert dl._files_ready() is False

    def test_all_files_ready(self, monkeypatch, tmp_path):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "DATA_DIR", tmp_path)
        for name, size in dl._EXPECTED_FILES.items():
            (tmp_path / name).write_bytes(b"x" * size)
        assert dl._files_ready() is True


class TestDataStatus:
    def test_is_data_ready_false_by_default(self, monkeypatch, tmp_path):
        from app.core.mnist import data_loader as dl

        # 开发机磁盘可能已有真实 MNIST 数据 → 将 DATA_DIR 指向空临时目录
        monkeypatch.setattr(dl, "DATA_DIR", tmp_path)
        assert dl.is_data_ready() is False

    def test_is_data_ready_true_when_status_ready(self):
        from app.core.mnist import data_loader as dl

        dl._status["ready"] = True
        assert dl.is_data_ready() is True

    def test_get_data_status_returns_copy(self):
        from app.core.mnist import data_loader as dl

        st = dl.get_data_status()
        st["ready"] = True  # 修改返回值不应影响内部状态
        assert dl._status["ready"] is False


class TestEnsureDataAsync:
    async def test_skips_download_when_ready(self, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: True)
        download_called = []

        def fake_download():
            download_called.append(True)
            raise AssertionError("数据已就绪时不应触发下载")

        monkeypatch.setattr(dl, "_download_sync", fake_download)
        assert await dl.ensure_mnist_data_async() is True
        assert download_called == []
        assert dl._status["ready"] is True

    async def test_download_success_marks_ready(self, monkeypatch):
        from app.core.mnist import data_loader as dl

        ready = [False]

        def fake_download():
            ready[0] = True  # 模拟下载完成后文件就绪

        monkeypatch.setattr(dl, "_download_sync", fake_download)
        monkeypatch.setattr(dl, "is_data_ready", lambda: ready[0])
        assert await dl.ensure_mnist_data_async() is True
        assert dl._status["ready"] is True
        assert dl._status["downloading"] is False

    async def test_download_failure_retries_then_fails(self, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "_MAX_RETRIES", 2)

        def fake_download():
            raise RuntimeError("network down")

        monkeypatch.setattr(dl, "_download_sync", fake_download)
        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        # 加速重试间隔，避免测试等 10s（须保存原始 sleep 引用，否则 lambda 内调用自身导致递归）
        orig_sleep = asyncio.sleep
        monkeypatch.setattr(asyncio, "sleep", lambda _: orig_sleep(0))
        assert await dl.ensure_mnist_data_async() is False
        assert dl._status["ready"] is False
        assert dl._status["downloading"] is False
        assert "失败" in dl._status["progress"]

    async def test_download_timeout_marks_error(self, monkeypatch):
        import time

        from app.core.mnist import data_loader as dl

        # to_thread 执行的是同步函数：用阻塞 sleep 模拟慢下载，等待 wait_for 超时
        def slow_download():
            time.sleep(5)

        monkeypatch.setattr(dl, "_download_sync", slow_download)
        monkeypatch.setattr(dl, "_DOWNLOAD_TIMEOUT", 0.05)
        monkeypatch.setattr(dl, "_MAX_RETRIES", 1)
        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        assert await dl.ensure_mnist_data_async() is False
        assert dl._status["downloading"] is False
        assert dl._status["error"] is not None


class TestMnistRoutes503:
    @pytest.mark.anyio
    async def test_run_returns_503_when_data_not_ready(self, client, monkeypatch):
        from app.api.routes import mnist as mnist_routes
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        monkeypatch.setattr(dl, "get_data_status", lambda: {
            "ready": False, "downloading": True, "error": None, "progress": "下载中…", "retry_count": 0,
        })
        resp = await client.post("/api/mnist/run", json={
            "session_id": 1,
            "architecture": {"id": "minicnn"},
            "hyperparameters": {"epochs": 1},
        })
        assert resp.status_code == 503
        detail = resp.json()["detail"]
        assert "数据准备中" in detail["message"]
        assert detail["retry_after"] == 10

    @pytest.mark.anyio
    async def test_run_stream_pushes_data_pending(self, client, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        monkeypatch.setattr(dl, "get_data_status", lambda: {
            "ready": False, "downloading": True, "error": None, "progress": "下载中…", "retry_count": 0,
        })
        resp = await client.post("/api/mnist/run-stream", json={
            "session_id": 1,
            "architecture": {"id": "minicnn"},
            "hyperparameters": {"epochs": 1},
        })
        assert resp.status_code == 200
        body = resp.text
        assert "data_pending" in body  # SSE 首事件告知前端数据未就绪
        assert "aborted" in body        # 随后正常关闭流

    @pytest.mark.anyio
    async def test_infer_returns_503_when_data_not_ready(self, client, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        monkeypatch.setattr(dl, "get_data_status", lambda: {
            "ready": False, "downloading": False, "error": None, "progress": "", "retry_count": 0,
        })
        resp = await client.post(
            "/api/mnist/infer",
            data={"session_id": "1", "model_id": "standardcnn"},
            files={"file": ("a.png", b"not-an-image", "image/png")},
        )
        assert resp.status_code == 503

    @pytest.mark.anyio
    async def test_architectures_includes_data_status(self, client):
        resp = await client.get("/api/mnist/architectures")
        assert resp.status_code == 200
        data = resp.json()
        assert "architectures" in data
        assert "data_status" in data

    @pytest.mark.anyio
    async def test_data_status_endpoint(self, client):
        resp = await client.get("/api/mnist/data-status")
        assert resp.status_code == 200
        data = resp.json()
        for k in ("ready", "downloading", "error", "progress", "retry_count"):
            assert k in data

    @pytest.mark.anyio
    async def test_data_retry_when_ready(self, client, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: True)
        resp = await client.post("/api/mnist/data-retry")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert resp.json()["message"] == "数据已就绪"

    @pytest.mark.anyio
    async def test_data_retry_triggers_download(self, client, monkeypatch):
        from app.core.mnist import data_loader as dl

        monkeypatch.setattr(dl, "is_data_ready", lambda: False)
        started = []

        async def fake_ensure():
            started.append(True)

        monkeypatch.setattr(dl, "ensure_mnist_data_async", fake_ensure)
        resp = await client.post("/api/mnist/data-retry")
        assert resp.status_code == 200
        assert resp.json()["message"] == "已触发重新下载"
        await asyncio.sleep(0)  # 让 create_task 有机会执行
        assert started == [True]
