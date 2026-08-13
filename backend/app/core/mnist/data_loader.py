"""MNIST 数据集后台准备 — 下载非阻塞化（MNIST_DOWNLOAD_NONBLOCKING_PLAN）。

现状：数据缺失时 torchvision 在训练/预训练时触发下载（约 64MB，10-60s），
且 startup 同步执行 import torch 阻塞事件循环，导致启动期间 API 不可用。

本模块：数据完整性校验 + 后台异步下载 + 状态查询 + 失败重试。
API 不依赖本模块即可启动；训练/推理端点通过 `is_data_ready()` 判断数据状态。
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

_log = logging.getLogger("mnist.data")

DATA_DIR = Path("./data/MNIST/raw")

# 期望文件（解压后）+ 大小（字节）；齐全且大小一致视为数据就绪
_EXPECTED_FILES = {
    "train-images-idx3-ubyte": 47040016,
    "train-labels-idx1-ubyte": 60008,
    "t10k-images-idx3-ubyte": 7840016,
    "t10k-labels-idx1-ubyte": 10008,
}

_MAX_RETRIES = 3
_DOWNLOAD_TIMEOUT = 300  # 5 分钟

# 数据准备状态（供 /data-status 端点与前端轮询）
_status: dict = {
    "ready": False,
    "downloading": False,
    "error": None,
    "progress": "",
    "retry_count": 0,
}
_download_lock = asyncio.Lock()


def _files_ready() -> bool:
    """校验 4 个数据文件是否存在且大小正确（不触发下载）。"""
    for name, size in _EXPECTED_FILES.items():
        p = DATA_DIR / name
        if not p.exists() or p.stat().st_size != size:
            return False
    return True


def is_data_ready() -> bool:
    """快速检查 MNIST 数据是否就绪。"""
    return _status["ready"] or _files_ready()


def get_data_status() -> dict:
    """返回当前数据准备状态（供 /data-status 端点与前端轮询）。"""
    return dict(_status)


def _download_sync() -> None:
    """同步下载 MNIST 数据集（在后台线程执行；torchvision 下载并解压到 data/MNIST/raw）。"""
    from torchvision import datasets, transforms

    tf = transforms.Compose(
        [transforms.ToTensor(), transforms.Normalize((0.1307,), (0.3081,))]
    )
    datasets.MNIST(root="./data", train=True, download=True, transform=tf)
    datasets.MNIST(root="./data", train=False, download=True, transform=tf)


async def ensure_mnist_data_async() -> bool:
    """后台准备 MNIST 数据：已就绪直接返回；否则下载（带重试与超时）。并发安全。

    返回 True 表示数据就绪；失败后状态可经 get_data_status() 查询。
    """
    async with _download_lock:
        if is_data_ready():
            _status.update(ready=True, downloading=False, error=None, progress="已就绪", retry_count=0)
            return True

        _status.update(ready=False, downloading=True, error=None, progress="下载中…", retry_count=0)
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(_download_sync),
                    timeout=_DOWNLOAD_TIMEOUT,
                )
            except Exception as e:  # 网络失败 / 超时 / MD5 校验失败
                _log.error(f"MNIST 下载第 {attempt} 次失败: {e}")
                _status.update(
                    downloading=False, error=str(e)[:200],
                    progress=f"第 {attempt} 次下载失败", retry_count=attempt,
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(5)
                    _status.update(
                        downloading=True, error=None,
                        progress=f"重试中（第 {attempt + 1} 次）…", retry_count=attempt,
                    )
                continue

            if is_data_ready():
                _status.update(ready=True, downloading=False, error=None, progress="已就绪", retry_count=attempt - 1)
                return True

        _status.update(ready=False, downloading=False, progress="下载失败（已重试 3 次），可手动重试")
        return False
