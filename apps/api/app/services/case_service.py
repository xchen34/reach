from __future__ import annotations

import hashlib
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.case_action import CaseAction
from app.models.case_share_link import CaseShareLink
from app.models.enums import (
    AuditActorType,
    AuditEventType,
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseActionType,
    CaseStatus,
    CaseVerificationTask,
    IncidentType,
    ShareLinkScope,
    StaffRole,
    SubjectType,
    UrgencyLevel,
)
from app.models.user import User
from app.schemas.case import (
    AnonymousCaseSubmissionRequest,
    AuditLogEntryResponse,
    CaseDetailResponse,
    CaseListItem,
    CaseSubmissionResponse,
    ShareLinkCaseView,
    ShareLinkSummary,
    StaffCaseActionRequest,
    StaffCaseActionResponse,
    StaffCaseOperationalStatusRequest,
    StaffCaseOutcomeRequest,
    StaffCaseMergeDuplicatesRequest,
    StaffCaseMergeDuplicatesResponse,
    StaffCasePublishRequest,
    StaffCasePublishResponse,
    StaffCaseRelationRequest,
    StaffCaseRelationResponse,
)
from app.schemas.staff import StaffUserSummary
from app.services.voice_intake import VoiceIntakeService
from app.services.incident_service import IncidentService
from app.services.report_attachment_service import ReportAttachmentService


class CaseService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def create_anonymous_case(
        self,
        payload: AnonymousCaseSubmissionRequest,
    ) -> CaseSubmissionResponse:
        incident = IncidentService(self.db).get_or_create_legacy_incident()
        case = Case(
            incident_id=incident.id,
            case_code=self._generate_case_code(),
            status=CaseStatus.PENDING_REVIEW,
            safety_status=CaseSafetyStatus.UNKNOWN,
            handling_status=CaseHandlingStatus.AWAITING_ACTION,
            verification_task=CaseVerificationTask.NONE,
            urgency=payload.urgency,
            incident_type=payload.incident_type,
            language_code=payload.language_code,
            location_summary=payload.location_summary,
            needs_summary=payload.needs_summary,
            latest_public_update="Report received. Waiting for staff review.",
            reporter_name=payload.reporter_name,
            reporter_email=payload.reporter_email,
            reporter_phone=payload.reporter_phone,
            subject_type=payload.subject_type,
        )
        self.db.add(case)
        self.db.flush()

        if payload.voice_intake_token:
            VoiceIntakeService(self.db).attach_confirmed_voice_to_case(
                case_id=case.id,
                voice_intake_token=payload.voice_intake_token,
            )

        share_token = secrets.token_urlsafe(18)
        share_link = CaseShareLink(
            case_id=case.id,
            token_hash=self._hash_token(share_token),
            scope=ShareLinkScope.STATUS_ONLY,
        )
        self.db.add(share_link)
        self.db.flush()

        initial_action = CaseAction(
            case_id=case.id,
            action_type=CaseActionType.NOTE,
            note="Anonymous case submitted.",
        )
        self.db.add(initial_action)

        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                case_id=case.id,
                share_link_id=share_link.id,
                event_type=AuditEventType.CASE_SUBMITTED,
                metadata_json={"status": case.status.value},
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.SYSTEM,
                case_id=case.id,
                share_link_id=share_link.id,
                event_type=AuditEventType.SHARE_LINK_CREATED,
                metadata_json={"scope": share_link.scope.value},
            )
        )
        self.db.commit()
        self.db.refresh(case)

        return CaseSubmissionResponse(
            id=case.id,
            case_code=case.case_code,
            status=case.status,
            share_link=ShareLinkSummary(
                token=share_token,
                url=f"{self.settings.magic_link_base_url.rstrip('/')}/share/{share_token}",
                scope=share_link.scope,
            ),
            created_at=case.created_at,
        )

    def list_cases(self) -> list[CaseListItem]:
        cases = self.db.scalars(select(Case).order_by(Case.created_at.desc())).all()
        return [self._to_case_list_item(case) for case in cases]

    def get_case(self, case_id: int) -> Optional[CaseDetailResponse]:
        case = self.db.get(Case, case_id)
        if case is None:
            return None
        return self._to_case_detail(case)

    def get_shared_case(self, token: str) -> Optional[ShareLinkCaseView]:
        share_link = self.db.scalar(
            select(CaseShareLink).where(CaseShareLink.token_hash == self._hash_token(token))
        )
        if share_link is None or share_link.revoked_at is not None:
            return None

        if share_link.expires_at is not None and self._coerce_utc(share_link.expires_at) < datetime.now(
            timezone.utc
        ):
            return None

        case = share_link.case
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                case_id=case.id,
                share_link_id=share_link.id,
                event_type=AuditEventType.SHARE_LINK_VIEWED,
                metadata_json={"scope": share_link.scope.value},
            )
        )
        self.db.commit()

        return ShareLinkCaseView(
            case_code=case.case_code,
            status=case.status,
            location_summary=case.location_summary,
            needs_summary=case.needs_summary,
            latest_public_update=case.latest_public_update,
            created_at=case.created_at,
        )

    def create_action(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseActionRequest,
    ) -> StaffCaseActionResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")

        target_user_id = payload.target_staff_user_id
        if payload.action_type == CaseActionType.CLAIM:
            target_user_id = actor.id

        if payload.action_type == CaseActionType.REASSIGN and actor.role != StaffRole.COORDINATOR:
            raise PermissionError("Only coordinators can reassign cases.")

        if target_user_id is not None and self.db.get(User, target_user_id) is None:
            raise ValueError("Target staff user not found.")

        from_status = case.status
        if payload.action_type == CaseActionType.STATUS_CHANGE and payload.to_status is not None:
            self.apply_legacy_status(case, payload.to_status)
            case.latest_public_update = f"Case status updated to {payload.to_status.value}."

        if payload.action_type in {CaseActionType.CLAIM, CaseActionType.REASSIGN}:
            case.assigned_staff_user_id = target_user_id

        action = CaseAction(
            case_id=case.id,
            actor_user_id=actor.id,
            action_type=payload.action_type,
            note=payload.note,
            from_status=from_status if payload.action_type == CaseActionType.STATUS_CHANGE else None,
            to_status=payload.to_status,
            target_staff_user_id=target_user_id,
        )
        self.db.add(action)
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={"action_type": payload.action_type.value},
            )
        )
        self.db.commit()
        self.db.refresh(action)

        return StaffCaseActionResponse.model_validate(action)

    def assign_to_self(self, case_id: int, actor: StaffUserSummary) -> CaseDetailResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")
        previous_status = case.status
        case.assigned_staff_user_id = actor.id
        if case.safety_status not in {CaseSafetyStatus.CONFIRMED_SAFE, CaseSafetyStatus.CONFIRMED_DECEASED}:
            self.apply_legacy_status(case, CaseStatus.ACTIVE)
        self._record_case_action(
            case=case,
            actor=actor,
            action_type=CaseActionType.CLAIM,
            note="Follow-up assigned.",
            from_status=previous_status,
            to_status=case.status,
            target_staff_user_id=actor.id,
        )
        self.db.commit()
        self.db.refresh(case)
        return self._to_case_detail(case)

    def return_to_unassigned(self, case_id: int, actor: StaffUserSummary, payload: StaffCaseOutcomeRequest) -> CaseDetailResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")
        previous_status = case.status
        case.assigned_staff_user_id = None
        # Keep the case ACTIVE (staff has already reviewed it); only clear the assignee.
        # PENDING_REVIEW is reserved for cases not yet seen by any staff member.
        # Use AWAITING_ACTION handling so the public board shows "unassigned", not "in_progress".
        if case.safety_status not in {CaseSafetyStatus.CONFIRMED_SAFE, CaseSafetyStatus.CONFIRMED_DECEASED}:
            case.status = CaseStatus.ACTIVE
            case.handling_status = CaseHandlingStatus.AWAITING_ACTION
        self._record_case_action(
            case=case,
            actor=actor,
            action_type=CaseActionType.REASSIGN,
            note=payload.note or "Returned to unassigned follow-up.",
            from_status=previous_status,
            to_status=case.status,
        )
        self.db.commit()
        self.db.refresh(case)
        return self._to_case_detail(case)

    def mark_safe_information_received(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseOutcomeRequest,
    ) -> CaseDetailResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")
        previous_status = case.status
        self.apply_legacy_status(case, CaseStatus.SAFE_RESOLVED)
        case.confirmation_source = payload.confirmation_source or payload.note
        case.confirmation_source_type = "reach_received_safe_information"
        case.confirmed_at = datetime.now(timezone.utc)
        case.latest_public_update = self._safe_public_update(case.subject_type)
        self._record_case_action(
            case=case,
            actor=actor,
            action_type=CaseActionType.STATUS_CHANGE,
            note=payload.note,
            from_status=previous_status,
            to_status=case.status,
        )
        self.db.commit()
        self.db.refresh(case)
        return self._to_case_detail(case)

    def mark_death_confirmed(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseOutcomeRequest,
    ) -> CaseDetailResponse:
        source = (payload.confirmation_source or payload.note or "").strip()
        if not source:
            source = "Confirmed deceased by volunteer action."
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")
        previous_status = case.status
        case.status = CaseStatus.CLOSED
        case.safety_status = CaseSafetyStatus.CONFIRMED_DECEASED
        case.handling_status = CaseHandlingStatus.ARCHIVED
        case.confirmation_source = source
        case.confirmation_source_type = "death_confirmation"
        case.confirmed_at = datetime.now(timezone.utc)
        case.latest_public_update = self._deceased_public_update(case.subject_type)
        self._record_case_action(
            case=case,
            actor=actor,
            action_type=CaseActionType.STATUS_CHANGE,
            note=source,
            from_status=previous_status,
            to_status=case.status,
        )
        self.db.commit()
        self.db.refresh(case)
        return self._to_case_detail(case)

    def correct_operational_status(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseOperationalStatusRequest,
    ) -> CaseDetailResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")

        previous_case_status = case.status
        previous_operational_status = self._operational_status(case)
        target_status = payload.target_status

        if target_status == "unassigned":
            case.assigned_staff_user_id = None
            case.confirmed_at = None
            case.confirmation_source = None
            case.confirmation_source_type = None
            # Use ACTIVE + AWAITING_ACTION so the case stays publicly visible.
            # PENDING_REVIEW is reserved for cases not yet seen by staff.
            case.status = CaseStatus.ACTIVE
            case.handling_status = CaseHandlingStatus.AWAITING_ACTION
            case.safety_status = CaseSafetyStatus.UNKNOWN
            case.latest_public_update = self._pending_public_update(case.subject_type)
        elif target_status == "in_progress":
            case.assigned_staff_user_id = actor.id
            case.confirmed_at = None
            case.confirmation_source = None
            case.confirmation_source_type = None
            self.apply_legacy_status(case, CaseStatus.ACTIVE)
            case.latest_public_update = self._in_progress_public_update(case.subject_type)
        elif target_status == "found_alive":
            self.apply_legacy_status(case, CaseStatus.SAFE_RESOLVED)
            case.confirmation_source = payload.note
            case.confirmation_source_type = "status_correction"
            case.confirmed_at = datetime.now(timezone.utc)
            case.latest_public_update = self._safe_public_update(case.subject_type)
        else:
            case.status = CaseStatus.CLOSED
            case.safety_status = CaseSafetyStatus.CONFIRMED_DECEASED
            case.handling_status = CaseHandlingStatus.ARCHIVED
            case.confirmation_source = payload.note or "Corrected to confirmed deceased by volunteer action."
            case.confirmation_source_type = "status_correction"
            case.confirmed_at = datetime.now(timezone.utc)
            case.latest_public_update = self._deceased_public_update(case.subject_type)

        new_operational_status = self._operational_status(case)
        note = payload.note.strip() if payload.note else None
        self.db.add(
            CaseAction(
                case_id=case.id,
                actor_user_id=actor.id,
                action_type=CaseActionType.STATUS_CHANGE,
                note=note,
                from_status=previous_case_status,
                to_status=case.status,
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": "operational_status_correction",
                    "from_operational_status": previous_operational_status,
                    "to_operational_status": new_operational_status,
                    "from_status": previous_case_status.value,
                    "to_status": case.status.value,
                    "note": note,
                },
            )
        )
        self.db.commit()
        self.db.refresh(case)
        return self._to_case_detail(case)

    def publish_case_update(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCasePublishRequest,
    ) -> StaffCasePublishResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")

        previous_status = case.status
        self.apply_legacy_status(case, payload.to_status)
        case.latest_public_update = payload.latest_public_update.strip()

        action = CaseAction(
            case_id=case.id,
            actor_user_id=actor.id,
            action_type=CaseActionType.STATUS_CHANGE,
            note=f"Published to board: {case.latest_public_update}",
            from_status=previous_status,
            to_status=payload.to_status,
        )
        self.db.add(action)
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": "publish_update",
                    "to_status": payload.to_status.value,
                    "latest_public_update": case.latest_public_update,
                },
            )
        )
        self.db.commit()
        self.db.refresh(case)

        return StaffCasePublishResponse(
            case_id=case.id,
            status=case.status,
            latest_public_update=case.latest_public_update or "",
            published_at=case.updated_at,
        )

    def relate_case(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseRelationRequest,
    ) -> StaffCaseRelationResponse:
        case = self.db.get(Case, case_id)
        if case is None:
            raise LookupError("Case not found.")

        related_case = self.db.get(Case, payload.related_case_id)
        if related_case is None:
            raise ValueError("Related case not found.")

        if related_case.id == case.id:
            raise ValueError("A case cannot be related to itself.")
        if related_case.incident_id != case.incident_id:
            raise ValueError("Cases from different incidents cannot be related.")

        relation_note = payload.note.strip() if payload.note else None
        if not relation_note:
            relation_note = (
                f"Marked case #{payload.related_case_id} as {payload.relation_type.replace('_', ' ')}."
            )

        # A confirmed duplicate should leave the active queue while retaining its
        # original record and audit history for staff review.
        if payload.relation_type == "confirmed_duplicate":
            self.apply_legacy_status(case, CaseStatus.CLOSED)

        action = CaseAction(
            case_id=case.id,
            actor_user_id=actor.id,
            action_type=CaseActionType.NOTE,
            note=relation_note,
        )
        self.db.add(action)
        self.db.flush()

        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": "relation_marked",
                    "related_case_id": related_case.id,
                    "relation_type": payload.relation_type,
                    "note": relation_note,
                    "closed_as_duplicate": payload.relation_type == "confirmed_duplicate",
                },
            )
        )
        self.db.commit()
        self.db.refresh(action)

        return StaffCaseRelationResponse(
            case_id=case.id,
            related_case_id=related_case.id,
            relation_type=payload.relation_type,
            note=relation_note,
            created_at=action.created_at,
        )

    def merge_duplicate_cases(
        self,
        case_id: int,
        actor: StaffUserSummary,
        payload: StaffCaseMergeDuplicatesRequest,
    ) -> StaffCaseMergeDuplicatesResponse:
        primary_case = self.db.get(Case, case_id)
        if primary_case is None:
            raise LookupError("Case not found.")
        if primary_case.merged_into_case_id is not None:
            raise ValueError("Primary case has already been merged into another case.")

        duplicate_ids = list(dict.fromkeys(payload.duplicate_case_ids))
        if case_id in duplicate_ids:
            raise ValueError("A case cannot be merged into itself.")

        duplicates: list[Case] = []
        for duplicate_id in duplicate_ids:
            duplicate_case = self.db.get(Case, duplicate_id)
            if duplicate_case is None:
                raise ValueError(f"Duplicate case {duplicate_id} not found.")
            if duplicate_case.incident_id != primary_case.incident_id:
                raise ValueError("Cases from different incidents cannot be merged.")
            if duplicate_case.merged_into_case_id is not None:
                raise ValueError(f"Duplicate case {duplicate_id} has already been merged.")
            duplicates.append(duplicate_case)

        note = payload.note.strip() if payload.note else None
        if not note:
            merged_codes = ", ".join(duplicate.case_code for duplicate in duplicates)
            note = f"Merged duplicate case(s) {merged_codes} into {primary_case.case_code}."

        now = datetime.now(timezone.utc)
        for duplicate_case in duplicates:
            previous_status = duplicate_case.status
            duplicate_case.merged_into_case_id = primary_case.id
            self.apply_legacy_status(duplicate_case, CaseStatus.CLOSED)
            self.db.add(
                CaseAction(
                    case_id=duplicate_case.id,
                    actor_user_id=actor.id,
                    action_type=CaseActionType.NOTE,
                    note=note,
                    from_status=previous_status,
                    to_status=duplicate_case.status,
                )
            )
            self.db.add(
                AuditLogEntry(
                    actor_type=AuditActorType.STAFF,
                    actor_user_id=actor.id,
                    case_id=duplicate_case.id,
                    event_type=AuditEventType.CASE_ACTION_CREATED,
                    metadata_json={
                        "action_type": "duplicate_merged",
                        "primary_case_id": primary_case.id,
                        "primary_case_code": primary_case.case_code,
                        "merged_case_id": duplicate_case.id,
                        "merged_case_code": duplicate_case.case_code,
                        "note": note,
                    },
                )
            )

        self.db.add(
            CaseAction(
                case_id=primary_case.id,
                actor_user_id=actor.id,
                action_type=CaseActionType.NOTE,
                note=note,
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=primary_case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": "duplicate_merged",
                    "primary_case_id": primary_case.id,
                    "primary_case_code": primary_case.case_code,
                    "merged_case_ids": [duplicate.id for duplicate in duplicates],
                    "merged_case_codes": [duplicate.case_code for duplicate in duplicates],
                    "note": note,
                },
            )
        )
        self.db.commit()

        return StaffCaseMergeDuplicatesResponse(
            primary_case_id=primary_case.id,
            merged_case_ids=[duplicate.id for duplicate in duplicates],
            note=note,
            created_at=now,
        )

    def list_audit_entries(self, case_id: int) -> list[AuditLogEntryResponse]:
        entries = self.db.scalars(
            select(AuditLogEntry)
            .where(AuditLogEntry.case_id == case_id)
            .order_by(AuditLogEntry.created_at.asc())
        ).all()
        return [AuditLogEntryResponse.model_validate(entry) for entry in entries]

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _generate_case_code(length: int = 10) -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))

    @staticmethod
    def _coerce_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

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

    def _to_case_detail(self, case: Case) -> CaseDetailResponse:
        base = self._to_case_list_item(case)
        return CaseDetailResponse(
            **base.model_dump(),
            language_code=case.language_code,
            reporter_name=case.reporter_name,
            reporter_email=case.reporter_email,
            appearance=case.appearance,
            clothing=case.clothing,
            identifying_details=case.identifying_details,
            mobility=case.mobility,
            companions=case.companions,
            last_known_time=case.last_known_time,
            confirmation_source=case.confirmation_source,
            confirmation_source_type=case.confirmation_source_type,
            confirmed_at=case.confirmed_at,
            merged_into_case_id=case.merged_into_case_id,
        )

    @staticmethod
    def apply_legacy_status(case: Case, status: CaseStatus) -> None:
        case.status = status
        safety_status, handling_status = CaseService.map_legacy_status(status)
        case.safety_status = safety_status
        case.handling_status = handling_status

    def _record_case_action(
        self,
        *,
        case: Case,
        actor: StaffUserSummary,
        action_type: CaseActionType,
        note: Optional[str],
        from_status: Optional[CaseStatus] = None,
        to_status: Optional[CaseStatus] = None,
        target_staff_user_id: Optional[int] = None,
    ) -> None:
        self.db.add(
            CaseAction(
                case_id=case.id,
                actor_user_id=actor.id,
                action_type=action_type,
                note=note,
                from_status=from_status,
                to_status=to_status,
                target_staff_user_id=target_staff_user_id,
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": action_type.value,
                    "operational_status": self._operational_status(case),
                },
            )
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

    @staticmethod
    def _safe_public_update(subject_type: SubjectType) -> str:
        if subject_type == SubjectType.PET:
            return "Reach has received information that the pet is safe."
        return "Reach has received information that the person is safe."

    @staticmethod
    def _deceased_public_update(subject_type: SubjectType) -> str:
        if subject_type == SubjectType.PET:
            return "Reach has received confirmed information that the pet has died."
        return "Reach has received confirmed information that the person has died."

    @staticmethod
    def _pending_public_update(subject_type: SubjectType) -> str:
        if subject_type == SubjectType.PET:
            return "Pet requiring follow-up."
        return "Person requiring follow-up."

    @staticmethod
    def _in_progress_public_update(subject_type: SubjectType) -> str:
        if subject_type == SubjectType.PET:
            return "Volunteer follow-up is in progress for this pet."
        return "Volunteer follow-up is in progress for this person."

    @staticmethod
    def map_legacy_status(status: CaseStatus) -> tuple[CaseSafetyStatus, CaseHandlingStatus]:
        if status == CaseStatus.PENDING_REVIEW:
            return CaseSafetyStatus.UNKNOWN, CaseHandlingStatus.AWAITING_ACTION
        if status == CaseStatus.ACTIVE:
            return CaseSafetyStatus.UNKNOWN, CaseHandlingStatus.BEING_INVESTIGATED
        if status == CaseStatus.WAITING_FOR_INFORMATION:
            return CaseSafetyStatus.UNKNOWN, CaseHandlingStatus.AWAITING_EXTERNAL_FEEDBACK
        if status == CaseStatus.SAFE_RESOLVED:
            return CaseSafetyStatus.CONFIRMED_SAFE, CaseHandlingStatus.ARCHIVED
        return CaseSafetyStatus.UNKNOWN, CaseHandlingStatus.ARCHIVED

    @staticmethod
    def project_legacy_status(
        safety_status: CaseSafetyStatus,
        handling_status: CaseHandlingStatus,
    ) -> CaseStatus:
        if safety_status == CaseSafetyStatus.CONFIRMED_SAFE and handling_status == CaseHandlingStatus.ARCHIVED:
            return CaseStatus.SAFE_RESOLVED
        if handling_status == CaseHandlingStatus.ARCHIVED:
            return CaseStatus.CLOSED
        if handling_status == CaseHandlingStatus.AWAITING_EXTERNAL_FEEDBACK:
            return CaseStatus.WAITING_FOR_INFORMATION
        if handling_status in {CaseHandlingStatus.BEING_INVESTIGATED, CaseHandlingStatus.ESCALATED_TO_RESCUERS}:
            return CaseStatus.ACTIVE
        return CaseStatus.PENDING_REVIEW
