from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import EmailStr, Field, model_validator

from app.models.enums import (
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseVerificationTask,
    IncidentType,
    ReportSourceChannel,
    ReportTriageActionType,
    ReportTriageStatus,
    SubjectType,
    UrgencyLevel,
)
from app.schemas.case import CaseDetailResponse, OperationalStatus
from app.schemas.attachment import StaffAttachmentResponse
from app.schemas.common import ApiModel


class ReportCaseSummary(ApiModel):
    id: int
    incident_id: int
    case_code: str
    person_label: Optional[str] = None
    subject_type: SubjectType = SubjectType.UNKNOWN
    safety_status: CaseSafetyStatus
    handling_status: CaseHandlingStatus
    operational_status: OperationalStatus
    can_modify_status: bool = True


class ReportListItem(ApiModel):
    id: int
    incident_id: int
    intake_source_id: Optional[int] = None
    report_code: str
    source_channel: ReportSourceChannel
    source_form_id: Optional[str] = None
    source_form_name: Optional[str] = None
    source_entry_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    received_at: datetime
    language_code: str
    triage_status: ReportTriageStatus
    reporter_relationship: Optional[str] = None
    is_first_hand: Optional[bool] = None
    permission_to_contact: Optional[bool] = None
    subject_type: SubjectType = SubjectType.UNKNOWN
    location_text: str
    original_narrative_preview: str
    # Full text as well as the preview: duplicate review has to compare what two
    # reports actually say, and a 220-character preview cuts off exactly the
    # detail that distinguishes them.
    original_narrative: str
    submission_type: Optional[str] = None
    person_name: Optional[str] = None
    approximate_age: Optional[str] = None
    gender: Optional[str] = None
    current_status: Optional[str] = None
    linked_case: Optional[ReportCaseSummary] = None
    legacy_case_id: Optional[int] = None
    is_legacy_backfill: bool
    migration_note: Optional[str] = None
    source_label: str
    attachments: list[StaffAttachmentResponse] = []


class ReportDetailResponse(ReportListItem):
    raw_answers_json: Optional[dict[str, Any]] = None
    original_narrative: str
    reporter_name: Optional[str] = None
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = None
    media_refs_json: Optional[list[dict[str, Any]]] = None
    voice_intake_id: Optional[int] = None
    triage_actions: list["ReportTriageActionResponse"]


class ReportTriageActionResponse(ApiModel):
    id: int
    report_id: int
    actor_user_id: Optional[int] = None
    action_type: ReportTriageActionType
    from_status: Optional[ReportTriageStatus] = None
    to_status: Optional[ReportTriageStatus] = None
    case_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime


class ReportInboxResponse(ApiModel):
    reports: list[ReportListItem]


class StaffReportCreateCaseRequest(ApiModel):
    urgency: UrgencyLevel
    incident_type: IncidentType
    location_summary: str = Field(min_length=5, max_length=280)
    needs_summary: str = Field(min_length=5, max_length=4000)
    person_label: Optional[str] = Field(default=None, max_length=160)
    approximate_age: Optional[str] = Field(default=None, max_length=80)
    appearance: Optional[str] = Field(default=None, max_length=4000)
    clothing: Optional[str] = Field(default=None, max_length=4000)
    identifying_details: Optional[str] = Field(default=None, max_length=4000)
    mobility: Optional[str] = Field(default=None, max_length=160)
    companions: Optional[str] = Field(default=None, max_length=4000)
    last_known_location: Optional[str] = Field(default=None, max_length=280)
    last_known_time: Optional[datetime] = None
    safety_status: CaseSafetyStatus = CaseSafetyStatus.UNKNOWN
    handling_status: CaseHandlingStatus = CaseHandlingStatus.AWAITING_ACTION
    verification_task: CaseVerificationTask = CaseVerificationTask.NONE
    assigned_staff_user_id: Optional[int] = None
    link_reason: Optional[str] = Field(default=None, max_length=400)
    note: Optional[str] = Field(default=None, max_length=4000)


class StaffReportCreateTaskRequest(ApiModel):
    note: Optional[str] = Field(default=None, max_length=4000)


class StaffReportLinkCaseRequest(ApiModel):
    case_id: int = Field(gt=0)
    link_reason: Optional[str] = Field(default=None, max_length=400)
    note: Optional[str] = Field(default=None, max_length=4000)


class StaffReportTriageDecisionRequest(ApiModel):
    note: str = Field(min_length=1, max_length=4000)


class StaffReportNoteRequest(ApiModel):
    note: str = Field(min_length=1, max_length=4000)


class StaffReportCreateCaseResponse(ApiModel):
    report: ReportDetailResponse
    case: CaseDetailResponse
    action: ReportTriageActionResponse


class StaffReportLinkCaseResponse(ApiModel):
    report: ReportDetailResponse
    case: CaseDetailResponse
    action: ReportTriageActionResponse


class StaffReportTriageDecisionResponse(ApiModel):
    report: ReportDetailResponse
    action: ReportTriageActionResponse


class StaffReportNoteResponse(ApiModel):
    report: ReportDetailResponse
    action: ReportTriageActionResponse


class ReportQueryParams(ApiModel):
    triage_status: Optional[ReportTriageStatus] = None

    @model_validator(mode="after")
    def validate_query(self) -> "ReportQueryParams":
        return self
