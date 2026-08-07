from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.enums import CaseHandlingStatus, CaseSafetyStatus, CaseStatus
from app.schemas.board import PublicBoardRecord, PublicBoardResponse, PublicBoardSummary
from app.services.report_attachment_service import ReportAttachmentService


class BoardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_public_board(self, *, include_archived: bool = False) -> PublicBoardResponse:
        statement = (
            select(Case)
            .where(Case.status != CaseStatus.PENDING_REVIEW, Case.withdrawn_at.is_(None))
            .order_by(Case.updated_at.desc(), Case.created_at.desc())
        )
        cases = self.db.scalars(statement).all()
        records: list[PublicBoardRecord] = []
        for case in cases:
            if case.merged_into_case_id is not None:
                continue
            status = self._operational_status(case)
            records.append(
                PublicBoardRecord(
                    public_id=case.case_code,
                    case_code=case.case_code,
                    operational_status=status,
                    subject_type=case.subject_type,
                    person_label=case.person_label,
                    approximate_age=case.approximate_age,
                    gender=None,
                    last_known_location=case.last_known_location or case.location_summary,
                    latest_public_update=case.latest_public_update,
                    platform_last_updated_at=case.updated_at,
                    public_image=ReportAttachmentService(self.db).first_public_board_attachment(case),
                )
            )

        counts = Counter(record.operational_status for record in records)

        return PublicBoardResponse(
            source_mode="case_tasks",
            records=records,
            summary=PublicBoardSummary(
                total_records=len(records),
                unassigned=counts.get("unassigned", 0),
                in_progress=counts.get("in_progress", 0),
                found_alive=counts.get("found_alive", 0),
                confirmed_deceased=counts.get("confirmed_deceased", 0),
            ),
        )

    @staticmethod
    def _operational_status(case: Case) -> str:
        if case.safety_status == CaseSafetyStatus.CONFIRMED_DECEASED:
            return "confirmed_deceased"
        if case.safety_status == CaseSafetyStatus.CONFIRMED_SAFE:
            return "found_alive"
        if case.assigned_staff_user_id is not None or case.handling_status in {
            CaseHandlingStatus.BEING_INVESTIGATED,
            CaseHandlingStatus.ESCALATED_TO_RESCUERS,
            CaseHandlingStatus.AWAITING_EXTERNAL_FEEDBACK,
        }:
            return "in_progress"
        return "unassigned"
