"""pytest 配置 — 共享 fixture 和测试数据库设置"""
import pytest
import os
import sys

# 确保 backend 在 path 中
sys.path.insert(0, os.path.dirname(__file__))

from app.models.database import Base, engine, SessionLocal, init_db
from app.main import app as fastapi_app
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """在测试运行前初始化数据库表。"""
    init_db()
    yield


@pytest.fixture
def db():
    """每个测试的独立数据库会话。"""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
async def client():
    """FastAPI TestClient（异步）。"""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
