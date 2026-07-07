from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
from app.models.magic_link_token import MagicLinkToken
from app.models.staff_session import StaffSession
from app.models.user import StaffRole, User
from app.security import (
    create_signed_magic_link_payload,
    hash_magic_link_token,
    hash_staff_session_token,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.delenv("BEACON_APP_ENV", raising=False)
    monkeypatch.delenv("BEACON_DEV_AUTO_CREATE_USERS", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    if previous_override is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_override


def _create_user(email: str = "coordinator@example.com") -> User:
    with Session(engine) as db:
        user = User(email=email, role=StaffRole.COORDINATOR)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def _issue_staff_session(client: TestClient, email: str = "coordinator@example.com") -> str:
    magic_link_response = client.post(
        "/auth/request-magic-link",
        json={"email": email},
    )
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=")[1]

    verify_response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )
    assert verify_response.status_code == 200
    return verify_response.json()["access_token"]


def test_verify_magic_link_rejects_invalid_token(client: TestClient) -> None:
    response = client.post(
        "/auth/verify-magic-link",
        json={"token": "not-a-valid-jwt"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "invalid_token"}


def test_verify_magic_link_rejects_reused_token(client: TestClient) -> None:
    signed_token = client.post(
        "/auth/request-magic-link",
        json={"email": "coordinator@example.com"},
    ).json()["login_url"].split("token=")[1]

    first_response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )
    second_response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 400
    assert second_response.json() == {"detail": "token_used"}


def test_verify_magic_link_rejects_expired_token(client: TestClient) -> None:
    user = _create_user()
    raw_token = "expired-token"
    signed_token = create_signed_magic_link_payload(raw_token)

    with Session(engine) as db:
        db.add(
            MagicLinkToken(
                user_id=user.id,
                token_hash=hash_magic_link_token(raw_token),
                signed_token=signed_token,
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )
        db.commit()

    response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "token_expired"}


def test_staff_route_rejects_invalid_session_token(client: TestClient) -> None:
    response = client.get(
        "/staff/me",
        headers={"Authorization": "Bearer invalid-session-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid session token."}


def test_staff_route_rejects_expired_session_token(client: TestClient) -> None:
    user = _create_user()

    with Session(engine) as db:
        db.add(
            StaffSession(
                user_id=user.id,
                token_hash=hash_staff_session_token("expired-session-token"),
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )
        db.commit()

    response = client.get(
        "/staff/me",
        headers={"Authorization": "Bearer expired-session-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Session expired."}


def test_logout_revokes_session_and_blocks_reuse(client: TestClient) -> None:
    access_token = _issue_staff_session(client)

    logout_response = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    me_response = client.get(
        "/staff/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert logout_response.status_code == 204
    assert me_response.status_code == 401
    assert me_response.json() == {"detail": "Session revoked."}


def test_request_magic_link_disables_auto_create_outside_development(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_APP_ENV", "production")
    monkeypatch.setenv("BEACON_DEV_AUTO_CREATE_USERS", "true")
    get_settings.cache_clear()

    response = client.post(
        "/auth/request-magic-link",
        json={"email": "new-staff@example.com"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unknown staff user."}
