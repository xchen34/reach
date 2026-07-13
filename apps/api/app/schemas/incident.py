from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.models.enums import IncidentStatus, IntakeSourceType
from app.schemas.common import ApiModel


class PublicIncidentReportPageResponse(ApiModel):
    id: int
    public_name: str
    slug: str
    disaster_type: str
    affected_area: str
    incident_start_time: Optional[datetime] = None
    public_description: Optional[str] = None
    supported_languages: list[str]
    status: IncidentStatus
    google_form_url: str


class StaffIncidentIntakeSourceResponse(ApiModel):
    id: int
    incident_id: int
    source_type: IntakeSourceType
    google_form_url: str
    google_form_id: Optional[str] = None
    google_sheet_name: str
    last_imported_row: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StaffIncidentSummary(ApiModel):
    id: int
    internal_name: str
    public_name: str
    slug: str
    disaster_type: str
    affected_area: str
    status: IncidentStatus
    intake_sources: list[StaffIncidentIntakeSourceResponse]


class IncidentIntakeImportResponse(ApiModel):
    incident_id: int
    intake_source_id: int
    imported: int
    skipped: int
    failed: int
    last_imported_row: int
    errors: list[str]
