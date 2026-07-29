from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import (
    CaseActionType,
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseStatus,
    CaseVerificationTask,
    IncidentType,
    ShareLinkScope,
    SubjectType,
    UrgencyLevel,
)
from app.schemas.attachment import StaffAttachmentResponse
from app.schemas.common import ApiModel
from app.schemas.staff import StaffUserSummary

StaffCaseRelationType = Literal["possible_duplicate", "confirmed_duplicate", "related_update"]
OperationalStatus = Literal["unassigned", "in_progress", "found_alive", "confirmed_deceased"]


class AnonymousCaseSubmissionRequest(BaseModel):
    incident_type: IncidentType
    urgency: UrgencyLevel
    language_code: str = Field(default="en", min_length=2, max_length=8)
    location_summary: str = Field(min_length=5, max_length=280)
    needs_summary: str = Field(min_length=5, max_length=4000)
    voice_intake_token: Optional[str] = Field(default=None, min_length=16)
    reporter_name: Optional[str] = Field(default=None, max_length=120)
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = Field(default=None, max_length=40)
    subject_type: SubjectType = SubjectType.UNKNOWN


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
    incident_id: int
    case_code: str
    status: CaseStatus
    urgency: UrgencyLevel
    incident_type: IncidentType
    location_summary: str
    needs_summary: str
    latest_public_update: Optional[str] = None
    subject_type: SubjectType = SubjectType.UNKNOWN
    person_label: Optional[str] = None
    approximate_age: Optional[str] = None
    last_known_location: Optional[str] = None
    safety_status: CaseSafetyStatus = CaseSafetyStatus.UNKNOWN
    handling_status: CaseHandlingStatus = CaseHandlingStatus.AWAITING_ACTION
    verification_task: CaseVerificationTask = CaseVerificationTask.NONE
    assigned_staff_user: Optional[StaffUserSummary] = None
    operational_status: OperationalStatus
    source_report_count: int = 0
    platform_last_updated_at: datetime
    created_at: datetime
    updated_at: datetime
    attachments: list[StaffAttachmentResponse] = []


class CaseDetailResponse(CaseListItem):
    language_code: str
    reporter_name: Optional[str] = None
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = None
    appearance: Optional[str] = None
    clothing: Optional[str] = None
    identifying_details: Optional[str] = None
    mobility: Optional[str] = None
    companions: Optional[str] = None
    last_known_time: Optional[datetime] = None
    confirmation_source: Optional[str] = None
    confirmation_source_type: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    merged_into_case_id: Optional[int] = None


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


class StaffCasePublishRequest(BaseModel):
    to_status: CaseStatus
    latest_public_update: str = Field(min_length=5, max_length=4000)


class StaffCasePublishResponse(ApiModel):
    case_id: int
    status: CaseStatus
    latest_public_update: str
    published_at: datetime


class StaffCaseRelationRequest(BaseModel):
    related_case_id: int = Field(gt=0)
    relation_type: StaffCaseRelationType
    note: Optional[str] = Field(default=None, max_length=4000)


class StaffCaseRelationResponse(ApiModel):
    case_id: int
    related_case_id: int
    relation_type: StaffCaseRelationType
    note: Optional[str] = None
    created_at: datetime


class StaffCaseOutcomeRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=4000)
    confirmation_source: Optional[str] = Field(default=None, max_length=280)


class AuditLogEntryResponse(ApiModel):
    id: int
    actor_type: str
    actor_user_id: Optional[int] = None
    case_id: Optional[int] = None
    share_link_id: Optional[int] = None
    event_type: str
    metadata_json: Optional[dict] = None
    created_at: datetime
