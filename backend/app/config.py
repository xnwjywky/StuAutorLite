"""应用配置"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置，从环境变量或 .env 文件加载"""

    # 应用
    app_name: str = "StuAutorLite"
    debug: bool = True

    # LLM
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"

    # 数据库
    database_url: str = "sqlite:///./data/stuautor.db"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
