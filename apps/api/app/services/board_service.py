from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.enums import CaseStatus
from app.schemas.board import PublicBoardRecord, PublicBoardResponse, PublicBoardSummary


class BoardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_public_board(self, *, include_archived: bool = False) -> PublicBoardResponse:
        statement = select(Case).order_by(Case.updated_at.desc(), Case.created_at.desc())
        cases = self.db.scalars(statement).all()

        records = [self._to_public_record(case) for case in cases]
        if not include_archived:
            records = [record for record in records if record.board_status != "archived"]

        counts = Counter(record.board_status for record in records)

        return PublicBoardResponse(
            source_mode="derived_from_cases",
            records=records,
            summary=PublicBoardSummary(
                total_records=len(records),
                unverified=counts.get("unverified", 0),
                responding=counts.get("responding", 0),
                needs_follow_up=counts.get("needs_follow_up", 0),
                safe_confirmed=counts.get("safe_confirmed", 0),
                archived=counts.get("archived", 0),
            ),
        )

    @staticmethod
    def _to_public_record(case: Case) -> PublicBoardRecord:
        return PublicBoardRecord(
            case_code=case.case_code,
            board_status=BoardService._map_status(case.status),
            urgency=case.urgency.value,
            incident_type=case.incident_type.value,
            language_code=case.language_code,
            location_summary=case.location_summary,
            needs_summary=case.needs_summary,
            latest_public_update=case.latest_public_update,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )

    @staticmethod
    def _map_status(status: CaseStatus) -> str:
        if status == CaseStatus.PENDING_REVIEW:
            return "unverified"
        if status == CaseStatus.ACTIVE:
            return "responding"
        if status == CaseStatus.WAITING_FOR_INFORMATION:
            return "needs_follow_up"
        if status == CaseStatus.SAFE_RESOLVED:
            return "safe_confirmed"
        return "archived"
