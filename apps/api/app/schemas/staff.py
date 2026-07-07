from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import StaffRole
from app.schemas.common import ApiModel


class StaffUserSummary(ApiModel):
    id: int
    email: str
    role: StaffRole


class StaffSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: StaffUserSummary


class CurrentStaffSession(ApiModel):
    user: StaffUserSummary
    session_expires_at: datetime


class StaffSessionRecord(ApiModel):
    id: int
    user_id: int
    expires_at: datetime
    revoked_at: Optional[datetime] = None

