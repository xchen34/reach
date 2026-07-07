from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db_session
from app.models.staff_session import StaffSession
from app.models.user import User
from app.schemas.staff import StaffUserSummary
from app.services.auth import AuthService


def get_db(db: Session = Depends(get_db_session)) -> Session:
    return db


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class StaffSessionContext:
    user: StaffUserSummary
    session: StaffSession
    db_user: User


def require_staff_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> StaffSessionContext:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    service = AuthService(db)
    validation = service.validate_staff_session(credentials.credentials)
    if not validation.valid or validation.session is None:
        detail = {
            "invalid_session": "Invalid session token.",
            "session_expired": "Session expired.",
            "session_revoked": "Session revoked.",
        }.get(validation.reason, "Invalid session token.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
        )
    session = validation.session

    if session.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session user not found.",
        )

    return StaffSessionContext(
        user=StaffUserSummary.model_validate(session.user),
        session=session,
        db_user=session.user,
    )
