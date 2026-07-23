"""FastAPI 入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import sessions, questions, experiments, analysis, reports, agents, reflection, classify, guessnumber, sorting, stringsearch, shaperecog, digits, imagerecog, mnist, rl
from app.models.database import init_db
from app.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

# CORS 中间件（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(sessions.router, prefix="/api")
app.include_router(questions.router, prefix="/api")
app.include_router(experiments.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(reflection.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(classify.router, prefix="/api")
app.include_router(guessnumber.router, prefix="/api")
app.include_router(sorting.router, prefix="/api")
app.include_router(stringsearch.router, prefix="/api")
app.include_router(shaperecog.router, prefix="/api")
app.include_router(digits.router, prefix="/api")
app.include_router(imagerecog.router, prefix="/api")
app.include_router(mnist.router, prefix="/api")
app.include_router(rl.router, prefix="/api")


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
    """健康检查 + 版本信息（用于确认后端是否已重新加载）"""
    import sys
    from pathlib import Path
    # 检查 RL 模块是否存在
    try:
        from app.api.routes.rl import RLRunRequest  # noqa: F401
        rl_ok = True
    except Exception:
        rl_ok = False
    # 检查 MNIST model_manager 是否含 get_all_model_info
    try:
        from app.core.mnist.model_manager import ModelManager
        mnist_ok = hasattr(ModelManager, "get_all_model_info")
    except Exception:
        mnist_ok = False

    return {
        "status": "ok",
        "version": "2026-07-22-rl",
        "python": sys.executable,
        "cwd": str(Path.cwd()),
        "modules": {"rl": rl_ok, "mnist_model_manager": mnist_ok},
    }
