from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BEACON_",
        case_sensitive=False,
    )

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://beacon:beacon@db:5432/beacon"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    auth_token_secret: str = Field(
        default="change-me-in-production",
        min_length=16,
    )
    magic_link_base_url: str = "http://localhost:8000"
    magic_link_ttl_minutes: int = 15
    dev_magic_link_mode: str = "response"
    dev_default_role: str = "volunteer"
    dev_auto_create_users: bool = True
    dev_magic_link_inbox_email: Optional[EmailStr] = None
    speech_to_text_provider: str = "development_stub"
    speech_to_text_openai_base_url: str = "https://api.openai.com/v1"
    speech_to_text_openai_api_key: Optional[str] = None
    speech_to_text_openai_model: str = "gpt-4o-mini-transcribe"
    speech_to_text_timeout_seconds: float = 30.0
    voice_storage_dir: str = "/tmp/beacon/voice_uploads"
    voice_max_upload_bytes: int = 10 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
