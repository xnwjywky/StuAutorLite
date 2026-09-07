"""重型 CPU 任务专用执行器 —— 防止 MNIST/RL 等长时训练占满 FastAPI 默认线程池。

背景（实测）：同步 `/run` 端点由 FastAPI 调度到默认线程池（约 40 worker），
MNIST/RL 训练一次可达数分钟，会持续占用一个 worker，多用户同时训练时可能
把默认线程池占满，导致其它短请求（DB/日志/SSE 心跳等）排队。

方案：把长时训练收敛到一个独立的小线程池（默认 3 线程），
- 训练类任务不再挤占默认线程池；
- 并发训练数量天然有上界（避免无限制抢占资源）。

注意：线程池按需惰性创建；进程退出时由解释器回收。
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

_MAX_WORKERS = 3  # 训练类任务最多并行 3 个（其余排队）

_executor: ThreadPoolExecutor | None = None


def get_heavy_executor() -> ThreadPoolExecutor:
    """返回进程级共享的“训练专用”线程池（惰性创建）。"""
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(
            max_workers=_MAX_WORKERS,
            thread_name_prefix="heavy-train",
        )
    return _executor


async def run_heavy(fn, *args):
    """在训练专用线程池中执行长时 CPU 任务（fn 需为同步函数）。

    用法：`result = await run_heavy(runner.run, config)`
    事件循环不被阻塞；请求只占用 1 个协程槽，而非默认线程池 worker。
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(get_heavy_executor(), fn, *args)
