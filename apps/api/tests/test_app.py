from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.deps import get_db
from app.db import Base
from app.main import app
from app.models.magic_link_token import MagicLinkToken
from app.models.user import StaffRole, User
from app.security import create_signed_magic_link_payload, hash_magic_link_token
from app.services.auth import AuthService


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


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_request_magic_link_returns_dev_url() -> None:
    response = client.post(
        "/auth/request-magic-link",
        json={"email": "volunteer@example.com"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Magic link generated for development use."
    assert payload["login_url"]


def test_verify_magic_link_valid_used_and_expired() -> None:
    with Session(engine) as db:
        user = User(email="coordinator@example.com", role=StaffRole.COORDINATOR)
        db.add(user)
        db.commit()
        db.refresh(user)

        raw_token = "plain-token"
        signed_token = create_signed_magic_link_payload(raw_token)
        valid_record = MagicLinkToken(
            user_id=user.id,
            token_hash=hash_magic_link_token(raw_token),
            signed_token=signed_token,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.add(valid_record)
        db.commit()

        service = AuthService(db)
        valid_result = service.verify_magic_link(signed_token)
        assert valid_result.valid is True
        assert valid_result.reason == "valid"
        assert valid_result.user_id == user.id

        valid_record.used_at = datetime.now(timezone.utc)
        db.add(valid_record)
        db.commit()

        used_result = service.verify_magic_link(signed_token)
        assert used_result.valid is False
        assert used_result.reason == "token_used"

        expired_token = "expired-token"
        expired_signed_token = create_signed_magic_link_payload(expired_token)
        expired_record = MagicLinkToken(
            user_id=user.id,
            token_hash=hash_magic_link_token(expired_token),
            signed_token=expired_signed_token,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db.add(expired_record)
        db.commit()

        expired_result = service.verify_magic_link(expired_signed_token)
        assert expired_result.valid is False
        assert expired_result.reason == "token_expired"


def test_verify_magic_link_endpoint_creates_staff_session() -> None:
    magic_link_response = client.post(
        "/auth/request-magic-link",
        json={"email": "coordinator@example.com"},
    )
    assert magic_link_response.status_code == 200
    login_url = magic_link_response.json()["login_url"]
    signed_token = login_url.split("token=")[1]

    verify_response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )
    assert verify_response.status_code == 200
    payload = verify_response.json()
    assert payload["token_type"] == "bearer"
    assert payload["magic_link_status"] == "accepted"
    assert payload["user"]["email"] == "coordinator@example.com"
