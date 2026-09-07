"""应用配置"""

from pathlib import Path

from pydantic_settings import BaseSettings

# P2：数据/模型/日志路径统一锚定到 backend/ 目录（不再相对 CWD）。
# 无论从哪个目录启动 uvicorn / pytest，都能定位到同一份数据与日志。
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
LOG_DIR = BACKEND_DIR / "logs"


class Settings(BaseSettings):
    """全局配置，从环境变量或 .env 文件加载"""

    # 应用
    app_name: str = "StuAutorLite"
    debug: bool = True

    # 安全（SECURITY_STABILITY_REVIEW P0-2）：共享访问密钥。
    # 留空 = 不启用鉴权（默认开发态，保持向后兼容）；
    # 设置后所有 /api 请求须带 X-App-Key 头，未匹配返回 401。
    app_key: str = ""

    # 安全（P1-3）：CORS 允许的来源，逗号分隔。默认仅本地前端开发源；
    # 部署时改为实际域名。禁止使用 "*" 与 allow_credentials=True 组合。
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # 安全（S-中-3）：每 IP 每分钟最大 API 请求数（0=关闭限流）。
    # 用于课堂/共享环境防止 LLM 端点被刷产生费用。
    rate_limit_per_minute: int = 0

    # 留存（P-性能）：运行明细大字段保留天数。超过该天数的 runs 明细（steps/path/
    # predictions 等 JSON 大字段）在启动后台清理中置空以控制 SQLite 体积，
    # 统计指标与整行记录保留。0=关闭清理。
    run_retention_days: int = 60

    # LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # 数据库（P2：默认锚定 backend/data/stuautor.db，支持环境变量覆盖）
    database_url: str = f"sqlite:///{DATA_DIR.as_posix()}/stuautor.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
