"""应用配置"""

from pydantic_settings import BaseSettings


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

    # LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # 数据库
    database_url: str = "sqlite:///./data/stuautor.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
