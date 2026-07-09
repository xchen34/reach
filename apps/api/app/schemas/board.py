from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from app.schemas.common import ApiModel


class PublicBoardRecord(ApiModel):
    case_code: str
    board_status: Literal["unverified", "responding", "needs_follow_up", "safe_confirmed", "archived"]
    urgency: str
    incident_type: str
    language_code: str
    location_summary: str
    needs_summary: str
    latest_public_update: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PublicBoardSummary(ApiModel):
    total_records: int
    unverified: int
    responding: int
    needs_follow_up: int
    safe_confirmed: int
    archived: int


class PublicBoardResponse(ApiModel):
    source_mode: Literal["derived_from_cases"]
    records: List[PublicBoardRecord]
    summary: PublicBoardSummary
