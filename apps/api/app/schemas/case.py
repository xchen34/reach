from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import CaseActionType, CaseStatus, IncidentType, ShareLinkScope, UrgencyLevel
from app.schemas.common import ApiModel
from app.schemas.staff import StaffUserSummary


class AnonymousCaseSubmissionRequest(BaseModel):
    incident_type: IncidentType
    urgency: UrgencyLevel
    language_code: str = Field(default="en", min_length=2, max_length=8)
    location_summary: str = Field(min_length=5, max_length=280)
    needs_summary: str = Field(min_length=5, max_length=4000)
    reporter_name: Optional[str] = Field(default=None, max_length=120)
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = Field(default=None, max_length=40)


class ShareLinkSummary(BaseModel):
    token: str
    url: str
    scope: ShareLinkScope


class CaseSubmissionResponse(ApiModel):
    id: int
    case_code: str
    status: CaseStatus
    share_link: ShareLinkSummary
    created_at: datetime


class CaseListItem(ApiModel):
    id: int
    case_code: str
    status: CaseStatus
    urgency: UrgencyLevel
    incident_type: IncidentType
    location_summary: str
    needs_summary: str
    latest_public_update: Optional[str] = None
    assigned_staff_user: Optional[StaffUserSummary] = None
    created_at: datetime
    updated_at: datetime


class CaseDetailResponse(CaseListItem):
    language_code: str
    reporter_name: Optional[str] = None
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = None


class ShareLinkCaseView(ApiModel):
    case_code: str
    status: CaseStatus
    location_summary: str
    needs_summary: str
    latest_public_update: Optional[str] = None
    created_at: datetime


class StaffCaseActionRequest(BaseModel):
    action_type: CaseActionType
    note: Optional[str] = Field(default=None, max_length=4000)
    to_status: Optional[CaseStatus] = None
    target_staff_user_id: Optional[int] = None

    @model_validator(mode="after")
    def validate_action_shape(self) -> "StaffCaseActionRequest":
        if self.action_type == CaseActionType.NOTE and not self.note:
            raise ValueError("A note action requires note text.")
        if self.action_type == CaseActionType.STATUS_CHANGE and self.to_status is None:
            raise ValueError("A status change action requires to_status.")
        if self.action_type == CaseActionType.CLAIM and self.target_staff_user_id is not None:
            raise ValueError("A claim action cannot target another staff user.")
        if self.action_type == CaseActionType.REASSIGN and self.target_staff_user_id is None:
            raise ValueError("A reassign action requires target_staff_user_id.")
        return self


class StaffCaseActionResponse(ApiModel):
    id: int
    case_id: int
    actor_user_id: Optional[int] = None
    action_type: CaseActionType
    note: Optional[str] = None
    from_status: Optional[CaseStatus] = None
    to_status: Optional[CaseStatus] = None
    target_staff_user_id: Optional[int] = None
    created_at: datetime


class AuditLogEntryResponse(ApiModel):
    id: int
    actor_type: str
    actor_user_id: Optional[int] = None
    case_id: Optional[int] = None
    share_link_id: Optional[int] = None
    event_type: str
    metadata_json: Optional[dict] = None
    created_at: datetime
