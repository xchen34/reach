from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.enums import CaseStatus
from app.schemas.board import PublicBoardRecord, PublicBoardResponse, PublicBoardSummary


class BoardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_public_board(self, *, include_archived: bool = False) -> PublicBoardResponse:
        statement = select(Case).order_by(Case.updated_at.desc(), Case.created_at.desc())
        cases = self.db.scalars(statement).all()
        cases_by_id = {case.id: case for case in cases}

        # A case enters the public board only through the explicit staff publish action.
        # Intake fields must never be used as public-board content.
        audit_entries = self.db.scalars(
            select(AuditLogEntry)
            .where(AuditLogEntry.case_id.is_not(None))
            .order_by(AuditLogEntry.created_at.desc(), AuditLogEntry.id.desc())
        ).all()
        records_by_case_id: dict[int, PublicBoardRecord] = {}

        for entry in audit_entries:
            metadata = entry.metadata_json or {}
            case = cases_by_id.get(entry.case_id)
            public_update = metadata.get("latest_public_update")
            published_status = metadata.get("to_status")
            if (
                case is None
                or metadata.get("action_type") != "publish_update"
                or not isinstance(public_update, str)
                or not public_update.strip()
                or published_status == CaseStatus.PENDING_REVIEW.value
                or entry.case_id in records_by_case_id
            ):
                continue

            if case.status == CaseStatus.CLOSED:
                if not include_archived:
                    continue
                board_status = "archived"
            else:
                try:
                    board_status = self._map_status(CaseStatus(published_status))
                except (TypeError, ValueError):
                    continue

            records_by_case_id[entry.case_id] = PublicBoardRecord(
                board_status=board_status,
                latest_public_update=public_update.strip(),
                updated_at=entry.created_at,
            )

        records = list(records_by_case_id.values())

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
