"""轻量共享密钥鉴权（SECURITY_STABILITY_REVIEW P0-2）。

- 配置 APP_KEY（环境变量）后启用：所有 /api 请求须带 `X-App-Key` 头，
  不匹配返回 401；未配置时依赖自动放行（默认开发态，向后兼容）。
- 用于课堂/局域网共享部署：防止任意主机直连调用所有端点、
  读取全局调用历史 / token 用量。
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import settings


async def verify_app_key(x_app_key: str | None = Header(None)) -> None:
    """FastAPI 依赖：校验 X-App-Key（APP_KEY 未配置时放行）。"""
    if not settings.app_key:
        return  # 未启用鉴权
    if not x_app_key or not hmac.compare_digest(x_app_key, settings.app_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或缺失的访问密钥（X-App-Key）",
        )
