from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from app.schemas.common import ApiModel


PublicOperationalStatus = Literal["unassigned", "in_progress", "found_alive", "confirmed_deceased"]


class PublicBoardRecord(ApiModel):
    public_id: str
    operational_status: PublicOperationalStatus
    person_label: Optional[str] = None
    approximate_age: Optional[str] = None
    gender: Optional[str] = None
    last_known_location: str
    latest_public_update: Optional[str] = None
    platform_last_updated_at: datetime


class PublicBoardSummary(ApiModel):
    total_records: int
    unassigned: int
    in_progress: int
    found_alive: int
    confirmed_deceased: int


class PublicBoardResponse(ApiModel):
    source_mode: Literal["case_tasks"]
    records: List[PublicBoardRecord]
    summary: PublicBoardSummary
