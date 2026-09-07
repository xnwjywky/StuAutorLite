"""FastAPI 入口"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import verify_app_key
from app.api.routes import sessions, questions, experiments, analysis, reports, agents, reflection, classify, guessnumber, sorting, stringsearch, shaperecog, digits, imagerecog, mnist, rl
from app.models.database import init_db
from app.config import settings
from app.utils.logger import get_console_handler, get_file_handler
from app.utils.rate_limit import rate_limit_middleware

# 统一使用 app.log 轮转 handler（P-性能：日志轮转，避免 app.log 无限增长；
# 多 logger 写同一文件共享同一 handler，杜绝重复轮转同一文件）。
_APP_LOG_FMT = "%(asctime)s [%(levelname)s] %(message)s"
startup_log = logging.getLogger("app.startup")
startup_log.setLevel(logging.DEBUG)
if not startup_log.handlers:
    startup_log.addHandler(get_file_handler("app.log", fmt=_APP_LOG_FMT))
    startup_log.addHandler(get_console_handler())

req_log = logging.getLogger("app.requests")
req_log.setLevel(logging.DEBUG)
if not req_log.handlers:
    req_log.addHandler(get_file_handler("app.log", fmt=_APP_LOG_FMT))
    req_log.addHandler(get_console_handler())


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """应用生命周期（P2：替换已弃用的 @app.on_event("startup")）。

    异步初始化，不阻塞 API 接收请求：
    数据库初始化快速执行；模型扫描、数据下载、预训练全部移入后台任务，
    startup 立即返回，uvicorn 即刻接受请求。
    """
    startup_log.info("=" * 50)
    startup_log.info("StuAutorLite 后端启动中...")

    # 1. 初始化数据库（快；用 to_thread 避免阻塞事件循环）
    await asyncio.to_thread(init_db)
    startup_log.info("[1/3] 数据库初始化完成")

    # 留存策略：后台清理超过保留期的运行明细大字段，控制 SQLite 体积（幂等、非致命）
    async def _background_retention():
        if not settings.run_retention_days:
            return
        try:
            from app.utils.retention import prune_run_payloads
            freed = await asyncio.to_thread(prune_run_payloads, settings.run_retention_days)
            if freed:
                startup_log.info(f"留存清理：已裁剪 {freed} 处旧实验明细大字段")
        except Exception as e:
            startup_log.warning(f"留存清理失败（非致命）: {e}")

    asyncio.create_task(_background_retention())

    # 2+3. 模型扫描 / MNIST 数据准备 / 预训练：全部丢后台任务，立即返回
    async def _background_init():
        """后台初始化：扫描模型 → 校验/下载 MNIST 数据 → 启动预训练。不阻塞 API。"""
        try:
            from app.core.mnist.model_manager import ModelManager, PRETRAINED_IDS
            mgr = ModelManager.get_instance()
            cached = [aid for aid in PRETRAINED_IDS if mgr.is_pretrained_cached(aid)]
            missing = [aid for aid in PRETRAINED_IDS if not mgr.is_pretrained_cached(aid)]
            startup_log.info(f"[2/3] 预训练模型: 已缓存 {len(cached)}, 缺失 {len(missing)}")

            # 数据完整性校验 + 缺失则后台下载（不阻塞，状态可经 /api/mnist/data-status 查询）
            from app.core.mnist.data_loader import ensure_mnist_data_async, get_data_status
            await ensure_mnist_data_async()
            startup_log.info(f"[2/3] MNIST 数据状态: {get_data_status()['progress']}")

            # 数据就绪后才启动预训练（预训练依赖数据集）
            from app.core.mnist.runner import _detect_device
            device_obj, _ = _detect_device()
            startup_log.info(f"[3/3] 检测设备: {device_obj}")
            ModelManager.start_pretrain_background(device=str(device_obj))
        except Exception as e:
            startup_log.warning(f"后台初始化失败（非致命，MNIST 功能可能暂不可用）: {e}")

    asyncio.create_task(_background_init())  # fire-and-forget，startup 立即返回
    startup_log.info("API 已就绪，MNIST 数据准备在后台进行")

    yield

    # 关闭共享 LLM 连接池（P-性能：httpx.AsyncClient 进程级复用，退出时释放）
    try:
        from app.utils.llm_client import close_shared_client
        await close_shared_client()
    except Exception:
        pass


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

# 全站轻量鉴权（P0-2）：APP_KEY 配置后所有 /api 路由须带 X-App-Key；
# 未配置时依赖自动放行（默认开发态，向后兼容）。
_API_DEPENDENCIES = [Depends(verify_app_key)]


# ── 请求日志中间件（所有入站请求均记录到控制台 + app.log，handler 模块级轮转）──
@app.middleware("http")
async def log_requests(request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = round((time.time() - t0) * 1000)
    req_log.info(f"{request.method} {request.url.path} → {response.status_code} ({ms}ms)")
    return response


# S-中-3：简单 IP 限流中间件（RATE_LIMIT_PER_MINUTE=0 时关闭）
app.middleware("http")(rate_limit_middleware)


# CORS 中间件（P1-3 修复 + 局域网回归修复）：
# - allow_credentials=False（项目鉴权走请求头，无 cookie/session，凭据不需要）
# - allow_origins = 显式配置的来源（cors_origins，默认本机前端开发源）
# - allow_origin_regex = 额外放行 回环 + 局域网私有网段（10./172.16-31./192.168.）
#   任意端口 —— 覆盖 README 支持的「局域网其他设备经 <本机IP>:5173 访问」场景，
#   避免浏览器因缺 Access-Control-Allow-Origin 头报 Network Error。
# 显式域名（如 https://你的域名）请在 CORS_ORIGINS 中配置。
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_origin_regex=(
        r"https?://(?:localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})"
        r"(?::\d+)?$"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由（P0-2：全部 /api 路由应用鉴权依赖）
app.include_router(sessions.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(questions.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(experiments.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(analysis.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(reports.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(reflection.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(agents.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(classify.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(guessnumber.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(sorting.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(stringsearch.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(shaperecog.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(digits.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(imagerecog.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(mnist.router, prefix="/api", dependencies=_API_DEPENDENCIES)
app.include_router(rl.router, prefix="/api", dependencies=_API_DEPENDENCIES)


@app.get("/")
def root():
    return {"message": f"Welcome to {settings.app_name} API"}


@app.get("/health")
def health_check():
    """健康检查 + 版本信息（用于确认后端是否已重新加载）— 直连端口 8000 访问"""
    return _health_payload()


@app.get("/api/health")
def api_health_check():
    """健康检查 — 通过 Vite /api 代理访问（/api 前缀已被 Vite 转发到后端）"""
    return _health_payload()


def _health_payload() -> dict:
    import sys
    from pathlib import Path
    try:
        from app.api.routes.rl import RLRunRequest  # noqa: F401
        rl_ok = True
    except Exception:
        rl_ok = False
    try:
        from app.core.mnist.model_manager import ModelManager
        mnist_ok = hasattr(ModelManager, "get_all_model_info")
    except Exception:
        mnist_ok = False

    return {
        "status": "ok",
        "version": "2026-07-24-rl",
        "python": sys.executable,
        "cwd": str(Path.cwd()),
        "modules": {"rl": rl_ok, "mnist_model_manager": mnist_ok},
    }
