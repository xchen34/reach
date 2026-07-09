from __future__ import annotations

from typing import Literal, Optional

from app.schemas.case import CaseListItem
from app.schemas.common import ApiModel


class StaffQueueGroup(ApiModel):
    id: str
    title: str
    status: str
    publish_state: Literal["awaiting_verification", "ready_to_publish", "published"]
    subject_name: Optional[str] = None
    source_relationship: Optional[str] = None
    update_chain_count: int
    report_kind: Optional[str] = None
    case_count: int
    open_case_count: int
    unassigned_case_count: int
    highest_urgency: str
    incident_type: str
    last_updated_at: str
    summary: str
    latest_public_update: Optional[str] = None
    related_cases: list[CaseListItem]


class StaffQueueSummary(ApiModel):
    total_events: int
    total_cases: int
    open_cases: int
    unassigned_cases: int
    critical_cases: int
    awaiting_verification_groups: int
    ready_to_publish_groups: int
    published_groups: int
    last_updated_at: Optional[str] = None


class StaffQueueResponse(ApiModel):
    source: Literal["staff-queue-adapter"]
    events: list[StaffQueueGroup]
    summary: StaffQueueSummary
