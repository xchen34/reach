from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas.auth import (
    MagicLinkRequest,
    MagicLinkRequestResponse,
    MagicLinkVerifyRequest,
    MagicLinkVerifyResponse,
)
from app.services.auth import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-magic-link", response_model=MagicLinkRequestResponse)
def request_magic_link(
    payload: MagicLinkRequest,
    db: Session = Depends(get_db),
) -> MagicLinkRequestResponse:
    service = AuthService(db)
    try:
        return service.request_magic_link(payload.email)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post("/verify-magic-link", response_model=MagicLinkVerifyResponse)
def verify_magic_link(
    payload: MagicLinkVerifyRequest,
    db: Session = Depends(get_db),
) -> MagicLinkVerifyResponse:
    service = AuthService(db)
    try:
        return service.verify_magic_link_and_create_session(payload.token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
