from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.schemas.staff import StaffSessionResponse


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkRequestResponse(BaseModel):
    message: str
    expires_at: datetime
    login_url: Optional[str] = None


class MagicLinkVerificationResult(BaseModel):
    valid: bool
    reason: str
    user_id: Optional[int] = None


class MagicLinkVerifyRequest(BaseModel):
    token: str


class MagicLinkVerifyResponse(StaffSessionResponse):
    magic_link_status: str = "accepted"
