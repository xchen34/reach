from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.enums import AuditEventType, CaseHandlingStatus, CaseSafetyStatus, CaseStatus, UrgencyLevel
from app.schemas.case import CaseListItem
from app.schemas.staff import StaffUserSummary
from app.schemas.staff_queue import StaffQueueGroup, StaffQueueResponse, StaffQueueSummary
from app.services.report_attachment_service import ReportAttachmentService


class StaffQueueService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_publish_queue(self) -> StaffQueueResponse:
        # A case merged into another is no longer its own piece of work. The
        # public board already skipped these; the staff queue did not, so a card
        # kept sitting in the list after it had been merged away.
        cases = self.db.scalars(
            select(Case)
            .where(Case.merged_into_case_id.is_(None))
            .order_by(Case.updated_at.desc(), Case.created_at.desc())
        ).all()
        case_ids = [case.id for case in cases]

        metadata_by_case_id = self._load_case_submission_metadata(case_ids)
        groups: dict[str, list[Case]] = defaultdict(list)

        for case in cases:
            groups[self._build_group_key(case, metadata_by_case_id.get(case.id))].append(case)

        events = [
            self._build_group(group_key, related_cases, metadata_by_case_id)
            for group_key, related_cases in groups.items()
        ]
        events.sort(key=lambda item: item.last_updated_at, reverse=True)

        summary_counts = Counter(event.publish_state for event in events)
        last_updated_at = events[0].last_updated_at if events else None

        return StaffQueueResponse(
            source="staff-queue-adapter",
            events=events,
            summary=StaffQueueSummary(
                total_events=len(events),
                total_cases=len(cases),
                open_cases=sum(1 for case in cases if not self._is_closed_status(case.status)),
                unassigned_cases=sum(1 for case in cases if case.assigned_staff_user is None),
                critical_cases=sum(1 for case in cases if case.urgency == UrgencyLevel.CRITICAL),
                awaiting_verification_groups=summary_counts.get("awaiting_verification", 0),
                ready_to_publish_groups=summary_counts.get("ready_to_publish", 0),
                published_groups=summary_counts.get("published", 0),
                last_updated_at=last_updated_at,
            ),
        )

    def _load_case_submission_metadata(self, case_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not case_ids:
            return {}

        entries = self.db.scalars(
            select(AuditLogEntry)
            .where(
                AuditLogEntry.case_id.in_(case_ids),
                AuditLogEntry.event_type == AuditEventType.CASE_SUBMITTED,
            )
            .order_by(AuditLogEntry.created_at.asc())
        ).all()

        metadata_by_case_id: dict[int, dict[str, Any]] = {}
        for entry in entries:
            if entry.case_id is None or entry.case_id in metadata_by_case_id:
                continue
            metadata_by_case_id[entry.case_id] = entry.metadata_json or {}
        return metadata_by_case_id

    def _build_group(
        self,
        group_key: str,
        related_cases: list[Case],
        metadata_by_case_id: dict[int, dict[str, Any]],
    ) -> StaffQueueGroup:
        sorted_cases = sorted(related_cases, key=lambda item: item.updated_at, reverse=True)
        lead_case = sorted_cases[0]
        lead_metadata = metadata_by_case_id.get(lead_case.id, {})
        related_case_items = [self._to_case_list_item(case) for case in sorted_cases]
        status = max(sorted_cases, key=lambda case: self._status_priority(case.status)).status
        highest_urgency = max(sorted_cases, key=lambda case: self._urgency_priority(case.urgency)).urgency
        latest_public_update = next((case.latest_public_update for case in sorted_cases if case.latest_public_update), None)
        report_kind = self._first_metadata_value(sorted_cases, metadata_by_case_id, "report_kind")
        subject_name = self._first_metadata_value(sorted_cases, metadata_by_case_id, "subject_name")
        source_relationship = self._most_common_metadata_value(sorted_cases, metadata_by_case_id, "source_relationship")
        update_chain_count = sum(
            1
            for case in sorted_cases
            if (metadata_by_case_id.get(case.id, {}).get("report_kind") == "update")
        )

        return StaffQueueGroup(
            id=group_key,
            title=subject_name or lead_case.location_summary,
            status=status.value,
            publish_state=self._publish_state(status),
            subject_name=subject_name,
            source_relationship=source_relationship,
            update_chain_count=update_chain_count,
            report_kind=report_kind,
            case_count=len(sorted_cases),
            open_case_count=sum(1 for case in sorted_cases if not self._is_closed_status(case.status)),
            unassigned_case_count=sum(1 for case in sorted_cases if case.assigned_staff_user is None),
            highest_urgency=highest_urgency.value,
            incident_type=lead_case.incident_type.value,
            last_updated_at=lead_case.updated_at.isoformat(),
            summary=latest_public_update or lead_case.needs_summary,
            latest_public_update=latest_public_update,
            related_cases=related_case_items,
        )

    def _build_group_key(self, case: Case, metadata: Optional[dict[str, Any]]) -> str:
        subject_name = (metadata or {}).get("subject_name")
        if isinstance(subject_name, str) and subject_name.strip():
            return f"subject:{self._slugify(subject_name)}:{case.incident_type.value}"
        return f"location:{self._slugify(case.location_summary)}:{case.incident_type.value}"

    def _to_case_list_item(self, case: Case) -> CaseListItem:
        assigned_staff_user = None
        if case.assigned_staff_user is not None:
            assigned_staff_user = StaffUserSummary.model_validate(case.assigned_staff_user)

        return CaseListItem(
            id=case.id,
            incident_id=case.incident_id,
            case_code=case.case_code,
            status=case.status,
            urgency=case.urgency,
            incident_type=case.incident_type,
            location_summary=case.location_summary,
            needs_summary=case.needs_summary,
            latest_public_update=case.latest_public_update,
            reporter_phone=case.reporter_phone,
            subject_type=case.subject_type,
            person_label=case.person_label,
            approximate_age=case.approximate_age,
            last_known_location=case.last_known_location,
            safety_status=case.safety_status,
            handling_status=case.handling_status,
            verification_task=case.verification_task,
            assigned_staff_user=assigned_staff_user,
            operational_status=self._operational_status(case),
            source_report_count=len(case.case_reports or []),
            platform_last_updated_at=case.updated_at,
            created_at=case.created_at,
            updated_at=case.updated_at,
            attachments=ReportAttachmentService(self.db).list_case_attachments(case.id),
        )

    def _first_metadata_value(
        self,
        cases: list[Case],
        metadata_by_case_id: dict[int, dict[str, Any]],
        key: str,
    ) -> Optional[str]:
        for case in cases:
            value = metadata_by_case_id.get(case.id, {}).get(key)
            if isinstance(value, str) and value.strip():
                return value
        return None

    def _most_common_metadata_value(
        self,
        cases: list[Case],
        metadata_by_case_id: dict[int, dict[str, Any]],
        key: str,
    ) -> Optional[str]:
        values = [
            value
            for case in cases
            for value in [metadata_by_case_id.get(case.id, {}).get(key)]
            if isinstance(value, str) and value.strip()
        ]
        if not values:
            return None
        return Counter(values).most_common(1)[0][0]

    @staticmethod
    def _publish_state(status: CaseStatus) -> str:
        if status == CaseStatus.PENDING_REVIEW:
            return "awaiting_verification"
        if status in {CaseStatus.ACTIVE, CaseStatus.WAITING_FOR_INFORMATION}:
            return "ready_to_publish"
        return "published"

    @staticmethod
    def _is_closed_status(status: CaseStatus) -> bool:
        return status in {CaseStatus.SAFE_RESOLVED, CaseStatus.CLOSED}

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

    @staticmethod
    def _status_priority(status: CaseStatus) -> int:
        return {
            CaseStatus.ACTIVE: 5,
            CaseStatus.PENDING_REVIEW: 4,
            CaseStatus.WAITING_FOR_INFORMATION: 3,
            CaseStatus.SAFE_RESOLVED: 2,
            CaseStatus.CLOSED: 1,
        }[status]

    @staticmethod
    def _urgency_priority(urgency: UrgencyLevel) -> int:
        return {
            UrgencyLevel.CRITICAL: 4,
            UrgencyLevel.HIGH: 3,
            UrgencyLevel.MEDIUM: 2,
            UrgencyLevel.LOW: 1,
        }[urgency]

    @staticmethod
    def _slugify(value: str) -> str:
        return (
            value.strip().lower().replace(" ", "-").replace("/", "-").replace("_", "-")
            or "group"
        )
