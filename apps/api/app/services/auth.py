from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.magic_link_token import MagicLinkToken
from app.models.enums import AuditActorType, AuditEventType, StaffRole
from app.models.staff_session import StaffSession
from app.models.user import User
from app.schemas.auth import (
    MagicLinkRequestResponse,
    MagicLinkVerificationResult,
    MagicLinkVerifyResponse,
)
from app.schemas.staff import CurrentStaffSession, StaffSessionResponse, StaffUserSummary
from app.security import (
    build_magic_link_secret,
    build_staff_session_secret,
    create_signed_magic_link_payload,
    decode_signed_magic_link_payload,
    hash_magic_link_token,
    hash_staff_session_token,
)
from app.services.audit_service import AuditService
from app.services.magic_link_delivery import MagicLinkDelivery


@dataclass(frozen=True)
class StaffSessionValidationResult:
    valid: bool
    reason: str
    session: Optional[StaffSession] = None


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.delivery = MagicLinkDelivery()
        self.audit = AuditService(db)

    def request_magic_link(self, email: str) -> MagicLinkRequestResponse:
        user = self._get_or_create_user(email)
        secret = build_magic_link_secret()
        signed_token = create_signed_magic_link_payload(secret.token)

        token_record = MagicLinkToken(
            user_id=user.id,
            token_hash=secret.token_hash,
            signed_token=signed_token,
            expires_at=secret.expires_at,
        )
        self.db.add(token_record)
        self.audit.log(
            actor_type=AuditActorType.STAFF,
            actor_user_id=user.id,
            event_type=AuditEventType.MAGIC_LINK_REQUESTED,
        )
        self.db.commit()
        self.db.refresh(token_record)

        login_url = self.delivery.deliver(
            email=email,
            signed_token=signed_token,
        )

        response_login_url = login_url if self.settings.dev_magic_link_mode == "response" else None
        return MagicLinkRequestResponse(
            message="Magic link generated for development use.",
            expires_at=token_record.expires_at,
            login_url=response_login_url,
        )

    def verify_magic_link(self, signed_token: str) -> MagicLinkVerificationResult:
        raw_token = decode_signed_magic_link_payload(signed_token)
        if raw_token is None:
            return MagicLinkVerificationResult(valid=False, reason="invalid_token")

        token_hash = hash_magic_link_token(raw_token)
        token_record = self.db.scalar(
            select(MagicLinkToken).where(MagicLinkToken.token_hash == token_hash)
        )
        if token_record is None:
            return MagicLinkVerificationResult(valid=False, reason="token_not_found")

        if token_record.used_at is not None:
            return MagicLinkVerificationResult(valid=False, reason="token_used")

        now = datetime.now(timezone.utc)
        expires_at = self._coerce_utc(token_record.expires_at)
        if expires_at < now:
            return MagicLinkVerificationResult(valid=False, reason="token_expired")

        return MagicLinkVerificationResult(
            valid=True,
            reason="valid",
            user_id=token_record.user_id,
        )

    def verify_magic_link_and_create_session(self, signed_token: str) -> MagicLinkVerifyResponse:
        raw_token = decode_signed_magic_link_payload(signed_token)
        if raw_token is None:
            raise ValueError("invalid_token")

        token_record = self._consume_magic_link_token(raw_token)
        verification_user_id = token_record.user_id

        session_secret = build_staff_session_secret()
        session = StaffSession(
            user_id=verification_user_id,
            token_hash=session_secret.token_hash,
            expires_at=session_secret.expires_at,
        )
        self.db.add(session)
        self.audit.log(
            actor_type=AuditActorType.STAFF,
            actor_user_id=verification_user_id,
            event_type=AuditEventType.MAGIC_LINK_VERIFIED,
        )
        self.audit.log(
            actor_type=AuditActorType.STAFF,
            actor_user_id=verification_user_id,
            event_type=AuditEventType.SESSION_CREATED,
            metadata_json={"expires_at": session_secret.expires_at.isoformat()},
        )
        self.db.commit()
        self.db.refresh(session)

        user = self.db.get(User, verification_user_id)
        if user is None:
            raise ValueError("user_not_found")

        return MagicLinkVerifyResponse(
            access_token=session_secret.token,
            expires_at=session.expires_at,
            user=StaffUserSummary.model_validate(user),
        )

    def get_current_staff_session(self, raw_session_token: str) -> Optional[CurrentStaffSession]:
        validation = self.validate_staff_session(raw_session_token)
        if not validation.valid or validation.session is None:
            return None
        session = validation.session

        return CurrentStaffSession(
            user=StaffUserSummary.model_validate(session.user),
            session_expires_at=session.expires_at,
        )

    def get_staff_session_record(self, raw_session_token: str) -> Optional[StaffSession]:
        validation = self.validate_staff_session(raw_session_token)
        return validation.session if validation.valid else None

    def validate_staff_session(self, raw_session_token: str) -> StaffSessionValidationResult:
        token_hash = hash_staff_session_token(raw_session_token)
        session = self.db.scalar(select(StaffSession).where(StaffSession.token_hash == token_hash))
        if session is None:
            return StaffSessionValidationResult(valid=False, reason="invalid_session")
        if session.revoked_at is not None:
            return StaffSessionValidationResult(valid=False, reason="session_revoked")
        if self._coerce_utc(session.expires_at) < datetime.now(timezone.utc):
            return StaffSessionValidationResult(valid=False, reason="session_expired")
        return StaffSessionValidationResult(valid=True, reason="valid", session=session)

    def revoke_staff_session(self, session: StaffSession) -> None:
        if session.revoked_at is not None:
            return
        session.revoked_at = datetime.now(timezone.utc)
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

    def _get_or_create_user(self, email: str) -> User:
        user = self.db.scalar(select(User).where(User.email == email))
        if user is not None:
            return user

        if not self.settings.dev_auto_create_users or self.settings.app_env != "development":
            raise ValueError("Unknown staff user.")

        role = StaffRole(self.settings.dev_default_role)
        user = User(email=email, role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    @staticmethod
    def _coerce_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _consume_magic_link_token(self, raw_token: str) -> MagicLinkToken:
        token_hash = hash_magic_link_token(raw_token)
        token_record = self.db.scalar(
            select(MagicLinkToken).where(MagicLinkToken.token_hash == token_hash)
        )
        if token_record is None:
            raise ValueError("token_not_found")

        now = datetime.now(timezone.utc)
        expires_at = self._coerce_utc(token_record.expires_at)
        if token_record.used_at is not None:
            raise ValueError("token_used")
        if expires_at < now:
            raise ValueError("token_expired")

        result = self.db.execute(
            update(MagicLinkToken)
            .where(
                MagicLinkToken.id == token_record.id,
                MagicLinkToken.used_at.is_(None),
            )
            .values(used_at=now)
        )
        if result.rowcount != 1:
            self.db.rollback()
            latest_record = self.db.get(MagicLinkToken, token_record.id)
            if latest_record is not None and latest_record.used_at is not None:
                raise ValueError("token_used")
            raise ValueError("invalid_token")

        self.db.refresh(token_record)
        return token_record
