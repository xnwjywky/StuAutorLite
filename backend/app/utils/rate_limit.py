"""轻量内存限流中间件（SECURITY_STABILITY_REVIEW S-中-3）。

基于滑动窗口的简单令牌桶：按客户端 IP 限流，超限返回 429。
- 纯内存实现（单进程），适合本工具单实例部署；
- 配置项：RATE_LIMIT_PER_MINUTE（每分钟每 IP 最大请求数，0=关闭）。
"""
from __future__ import annotations

import threading
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import settings


class RateLimiter:
    """滑动窗口限流器（每 IP 独立窗口，线程安全）。"""

    def __init__(self, max_requests: int, window_secs: int = 60):
        self.max_requests = max_requests
        self.window_secs = window_secs
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """判断 key 是否允许通过；通过则记录本次请求时间。"""
        now = time.time()
        with self._lock:
            window_start = now - self.window_secs
            recent = [t for t in self._hits.get(key, []) if t > window_start]
            if len(recent) >= self.max_requests:
                self._hits[key] = recent  # 保留窗口内时间戳，便于后续判断
                return False
            recent.append(now)
            self._hits[key] = recent
            return True


_limiter: RateLimiter | None = None


def _get_limiter() -> RateLimiter | None:
    global _limiter
    if settings.rate_limit_per_minute <= 0:
        return None
    if _limiter is None:
        _limiter = RateLimiter(max_requests=settings.rate_limit_per_minute)
    return _limiter


def client_ip(request: Request) -> str:
    """提取客户端 IP（兼容反向代理 X-Forwarded-For）。"""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit_middleware(request: Request, call_next):
    """限流中间件：/api 前缀请求按 IP 限流，超限返回 429。"""
    limiter = _get_limiter()
    if limiter is None or not request.url.path.startswith("/api"):
        return await call_next(request)
    if not limiter.allow(client_ip(request)):
        return JSONResponse(status_code=429, content={"detail": "请求过于频繁，请稍后再试"})
    return await call_next(request)
