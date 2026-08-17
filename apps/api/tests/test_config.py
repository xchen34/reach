from __future__ import annotations

from app.config import get_settings


def test_settings_accepts_railway_database_url(monkeypatch) -> None:
    monkeypatch.delenv("Reach_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/app")

    get_settings.cache_clear()
    try:
        assert (
            get_settings().database_url
            == "postgresql+psycopg://user:pass@host:5432/app"
        )
    finally:
        get_settings.cache_clear()


def test_settings_normalizes_legacy_postgres_url(monkeypatch) -> None:
    monkeypatch.setenv("Reach_DATABASE_URL", "postgres://user:pass@host:5432/app")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    get_settings.cache_clear()
    try:
        assert (
            get_settings().database_url
            == "postgresql+psycopg://user:pass@host:5432/app"
        )
    finally:
        get_settings.cache_clear()
