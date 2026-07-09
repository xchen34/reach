from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import CaseStatus, IncidentType, UrgencyLevel
from app.schemas.common import ApiModel


GoogleFormReportKind = Literal["safe", "missing", "update"]
GoogleFormSourceRelationship = Literal["self", "family_friend", "community_member", "on_site", "other"]
GoogleFormUpdateCategory = Literal["safe_sighting", "missing_lead", "correction", "resource_update", "other"]


class GoogleFormIngestRequest(BaseModel):
    report_kind: GoogleFormReportKind
    location_summary: str = Field(min_length=5, max_length=280)
    details_summary: str = Field(min_length=5, max_length=4000)
    language_code: str = Field(default="en", min_length=2, max_length=8)
    urgency: Optional[UrgencyLevel] = None
    incident_type: Optional[IncidentType] = None
    reporter_name: Optional[str] = Field(default=None, max_length=120)
    reporter_email: Optional[EmailStr] = None
    reporter_phone: Optional[str] = Field(default=None, max_length=40)
    subject_name: Optional[str] = Field(default=None, max_length=120)
    public_update_hint: Optional[str] = Field(default=None, max_length=4000)
    source_relationship: Optional[GoogleFormSourceRelationship] = None
    callback_allowed: Optional[bool] = None
    public_visibility_requested: Optional[bool] = None
    update_category: Optional[GoogleFormUpdateCategory] = None
    source_form_name: Optional[str] = Field(default=None, max_length=160)
    source_entry_id: Optional[str] = Field(default=None, max_length=160)
    submitted_at: Optional[datetime] = None


class GoogleFormIngestResponse(ApiModel):
    id: int
    case_code: str
    status: CaseStatus
    source: Literal["google_form"]
    report_kind: GoogleFormReportKind
    imported_at: datetime
