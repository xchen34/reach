from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.config import get_settings


@dataclass(frozen=True)
class MagicLinkSecret:
    token: str
    token_hash: str
    expires_at: datetime


@dataclass(frozen=True)
class SessionSecret:
    token: str
    token_hash: str
    expires_at: datetime


def build_magic_link_secret() -> MagicLinkSecret:
    settings = get_settings()
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.magic_link_ttl_minutes)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return MagicLinkSecret(token=raw_token, token_hash=token_hash, expires_at=expires_at)


def hash_magic_link_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_staff_session_secret(session_ttl_hours: int = 12) -> SessionSecret:
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=session_ttl_hours)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return SessionSecret(token=raw_token, token_hash=token_hash, expires_at=expires_at)


def hash_staff_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_signed_magic_link_payload(token: str) -> str:
    settings = get_settings()
    payload = {
        "sub": "magic-link",
        "token": token,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.magic_link_ttl_minutes),
    }
    return jwt.encode(payload, settings.auth_token_secret, algorithm="HS256")


def decode_signed_magic_link_payload(signed_token: str) -> Optional[str]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            signed_token,
            settings.auth_token_secret,
            algorithms=["HS256"],
        )
    except JWTError:
        return None

    if payload.get("sub") != "magic-link":
        return None

    token = payload.get("token")
    if not isinstance(token, str) or not token:
        return None

    return token
