from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://genesis:genesis_dev@localhost:5432/genesis"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        # Railway provides postgres:// or postgresql:// — normalize to asyncpg driver
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

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
    telegram_webhook_url: str = ""  # Set to https://<backend>/api/v1/telegram on Railway

    # Slack
    slack_webhook_url: str = ""

    # Email — SendGrid (preferred) or SMTP fallback
    sendgrid_api_key: str = ""
    email_from: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # Modal (code execution sandbox)
    modal_token_id: str = ""
    modal_token_secret: str = ""

    # GitHub
    github_token: str = ""
    github_repo_owner: str = ""
    github_repo_name: str = ""

    # Jira
    jira_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""

    # Notion
    notion_api_key: str = ""

    # Google Calendar (JSON blob of OAuth2 credentials)
    google_calendar_credentials_json: str = ""

    # Google Sheets (JSON blob of service account credentials)
    google_sheets_credentials_json: str = ""

    # Twilio (WhatsApp + SMS)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""  # e.g. whatsapp:+14155238886
    twilio_sms_from: str = ""       # e.g. +14155238886

    # App
    secret_key: str = "change_this_to_random_32_char_string"
    environment: str = "development"
    log_level: str = "INFO"
    frontend_url: str = "https://genesis-ai.up.railway.app"

    # Repair Agent
    repair_model: str = "claude-haiku-4-5-20251001"
    max_repair_attempts: int = 3

    @property
    def sync_database_url(self) -> str:
        """Synchronous URL for Alembic migrations (psycopg2 driver)."""
        return self.database_url.replace("+asyncpg", "+psycopg2")


settings = Settings()
