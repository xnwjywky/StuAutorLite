"""FastAPI 入口"""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import verify_app_key
from app.api.routes import sessions, questions, experiments, analysis, reports, agents, reflection, classify, guessnumber, sorting, stringsearch, shaperecog, digits, imagerecog, mnist, rl
from app.models.database import init_db
from app.config import settings
from app.utils.rate_limit import rate_limit_middleware

app = FastAPI(title=settings.app_name, debug=settings.debug)

# 全站轻量鉴权（P0-2）：APP_KEY 配置后所有 /api 路由须带 X-App-Key；
# 未配置时依赖自动放行（默认开发态，向后兼容）。
_API_DEPENDENCIES = [Depends(verify_app_key)]


# ── 请求日志中间件（所有入站请求均记录到控制台 + app.log）──
@app.middleware("http")
async def log_requests(request, call_next):
    import logging, time
    _req_log = logging.getLogger("app.requests")
    _req_log.setLevel(logging.DEBUG)
    if not _req_log.handlers:
        from pathlib import Path
        _log_dir = Path(__file__).resolve().parent.parent / "logs"
        _log_dir.mkdir(exist_ok=True)
        _fh = logging.FileHandler(str(_log_dir / "app.log"), encoding="utf-8")
        _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        _req_log.addHandler(_fh)
        _sh = logging.StreamHandler()
        _sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        _req_log.addHandler(_sh)

    t0 = time.time()
    response = await call_next(request)
    ms = round((time.time() - t0) * 1000)
    _req_log.info(f"{request.method} {request.url.path} → {response.status_code} ({ms}ms)")
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


@app.on_event("startup")
def on_startup():
    """应用启动时初始化数据库 + 触发预训练模型后台训练"""
    import logging
    from pathlib import Path

    _log_dir = Path(__file__).resolve().parent.parent / "logs"  # backend/logs/
    _log_dir.mkdir(exist_ok=True)

    # 配置启动日志文件
    startup_log = logging.getLogger("app.startup")
    startup_log.setLevel(logging.DEBUG)
    if not startup_log.handlers:
        fh = logging.FileHandler(str(_log_dir / "app.log"), encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        startup_log.addHandler(fh)
        startup_log.addHandler(logging.StreamHandler())  # 也输出到控制台

    startup_log.info("=" * 50)
    startup_log.info("StuAutorLite 后端启动中...")

    # 1. 初始化数据库
    startup_log.info("[1/3] 初始化数据库...")
    init_db()
    startup_log.info("[1/3] 数据库初始化完成")

    # 2. 初始化 ModelManager 单例（扫描已有模型文件），不依赖 torch
    startup_log.info("[2/3] 扫描预训练模型文件...")
    try:
        from app.core.mnist.model_manager import ModelManager, PRETRAINED_IDS
        mgr = ModelManager.get_instance()
        cached = [aid for aid in PRETRAINED_IDS if mgr.is_pretrained_cached(aid)]
        missing = [aid for aid in PRETRAINED_IDS if not mgr.is_pretrained_cached(aid)]
        startup_log.info(f"[2/3] 预训练模型: 已缓存 {len(cached)} ({', '.join(cached) if cached else '—'}), 缺失 {len(missing)} ({', '.join(missing) if missing else '—'})")
    except Exception as e:
        startup_log.warning(f"[2/3] ModelManager 初始化失败（非致命，MNIST 功能可能不可用）: {e}")

    # 3. 在后台线程中串行训练缺失的预训练模型
    startup_log.info("[3/3] 启动预训练后台任务...")
    try:
        from app.core.mnist.model_manager import ModelManager
        from app.core.mnist.runner import _detect_device
        device_obj, _ = _detect_device()
        startup_log.info(f"[3/3] 检测设备: {device_obj}")
        ModelManager.start_pretrain_background(device=str(device_obj))
        startup_log.info("[3/3] 预训练后台线程已启动")
    except Exception as e:
        startup_log.warning(f"[3/3] 预训练后台启动跳过（torch 可能未安装）: {e}")

    startup_log.info("StuAutorLite 后端启动完成")


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
