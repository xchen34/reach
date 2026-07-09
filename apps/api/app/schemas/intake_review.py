from __future__ import annotations

from typing import Literal, Optional

from app.schemas.common import ApiModel


class StaffSuggestedCaseIntakeSummary(ApiModel):
    headline: str
    situation_overview: str
    urgency_note: str
    recommended_follow_up: list[str]


class StaffSuggestedCaseIntakeTags(ApiModel):
    urgency_cues: list[str]
    missing_person_mentions: list[str]
    incident_or_resource_types: list[str]
    follow_up_needs: list[str]


class StaffCaseIntakeReviewResponse(ApiModel):
    status: Literal["ready", "unavailable"]
    suggestion_only: bool
    source_inputs: list[str]
    source_preview: str
    disclaimer: str
    staff_summary_suggestion: Optional[StaffSuggestedCaseIntakeSummary] = None
    suggested_tags: Optional[StaffSuggestedCaseIntakeTags] = None
    fallback_message: Optional[str] = None
