from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://genesis:genesis_dev@localhost:5432/genesis"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection_name: str = "genesis_patterns"

    # LLM providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Modal
    modal_token_id: str = ""
    modal_token_secret: str = ""

    # GitHub
    github_token: str = ""
    github_repo_owner: str = ""
    github_repo_name: str = ""

    # App
    secret_key: str = "change_this_to_random_32_char_string"
    environment: str = "development"
    log_level: str = "INFO"


settings = Settings()
