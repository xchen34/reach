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
    CaseActionType,
    CaseStatus,
    IncidentType,
    ShareLinkScope,
    StaffRole,
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
    StaffCasePublishRequest,
    StaffCasePublishResponse,
    StaffCaseRelationRequest,
    StaffCaseRelationResponse,
)
from app.schemas.google_forms import GoogleFormIngestRequest, GoogleFormIngestResponse
from app.schemas.staff import StaffUserSummary
from app.services.voice_intake import VoiceIntakeService


class CaseService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def create_anonymous_case(
        self,
        payload: AnonymousCaseSubmissionRequest,
    ) -> CaseSubmissionResponse:
        case = Case(
            case_code=self._generate_case_code(),
            status=CaseStatus.PENDING_REVIEW,
            urgency=payload.urgency,
            incident_type=payload.incident_type,
            language_code=payload.language_code,
            location_summary=payload.location_summary,
            needs_summary=payload.needs_summary,
            latest_public_update="Report received. Waiting for staff review.",
            reporter_name=payload.reporter_name,
            reporter_email=payload.reporter_email,
            reporter_phone=payload.reporter_phone,
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

    def create_google_form_case(self, payload: GoogleFormIngestRequest) -> GoogleFormIngestResponse:
        case = Case(
            case_code=self._generate_case_code(),
            status=CaseStatus.PENDING_REVIEW,
            urgency=payload.urgency or self._default_urgency_for_report_kind(payload.report_kind),
            incident_type=payload.incident_type or self._default_incident_type_for_report_kind(payload.report_kind),
            language_code=payload.language_code,
            location_summary=payload.location_summary,
            needs_summary=payload.details_summary,
            latest_public_update=payload.public_update_hint
            or self._default_public_update_for_report_kind(payload.report_kind),
            reporter_name=payload.reporter_name,
            reporter_email=payload.reporter_email,
            reporter_phone=payload.reporter_phone,
        )
        self.db.add(case)
        self.db.flush()

        share_token = secrets.token_urlsafe(18)
        share_link = CaseShareLink(
            case_id=case.id,
            token_hash=self._hash_token(share_token),
            scope=ShareLinkScope.STATUS_ONLY,
        )
        self.db.add(share_link)
        self.db.flush()

        self.db.add(
            CaseAction(
                case_id=case.id,
                action_type=CaseActionType.NOTE,
                note=self._build_google_form_import_note(payload),
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.SYSTEM,
                case_id=case.id,
                share_link_id=share_link.id,
                event_type=AuditEventType.CASE_SUBMITTED,
                metadata_json={
                    "status": case.status.value,
                    "source": "google_form",
                    "report_kind": payload.report_kind,
                    "subject_name": payload.subject_name,
                    "source_relationship": payload.source_relationship,
                    "callback_allowed": payload.callback_allowed,
                    "public_visibility_requested": payload.public_visibility_requested,
                    "update_category": payload.update_category,
                    "source_form_name": payload.source_form_name,
                    "source_entry_id": payload.source_entry_id,
                },
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.SYSTEM,
                case_id=case.id,
                share_link_id=share_link.id,
                event_type=AuditEventType.SHARE_LINK_CREATED,
                metadata_json={"scope": share_link.scope.value, "source": "google_form"},
            )
        )
        self.db.commit()
        self.db.refresh(case)

        return GoogleFormIngestResponse(
            id=case.id,
            case_code=case.case_code,
            status=case.status,
            source="google_form",
            report_kind=payload.report_kind,
            imported_at=case.created_at,
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
            case.status = payload.to_status
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
        case.status = payload.to_status
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

        relation_note = payload.note.strip() if payload.note else None
        if not relation_note:
            relation_note = (
                f"Marked case #{payload.related_case_id} as {payload.relation_type.replace('_', ' ')}."
            )

        # A confirmed duplicate should leave the active queue while retaining its
        # original record and audit history for staff review.
        if payload.relation_type == "confirmed_duplicate":
            case.status = CaseStatus.CLOSED

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

    @staticmethod
    def _default_incident_type_for_report_kind(report_kind: str) -> IncidentType:
        return {
            "safe": IncidentType.OTHER,
            "missing": IncidentType.OTHER,
            "update": IncidentType.OTHER,
        }[report_kind]

    @staticmethod
    def _default_urgency_for_report_kind(report_kind: str) -> UrgencyLevel:
        return {
            "safe": UrgencyLevel.LOW,
            "missing": UrgencyLevel.HIGH,
            "update": UrgencyLevel.MEDIUM,
        }[report_kind]

    @staticmethod
    def _default_public_update_for_report_kind(report_kind: str) -> str:
        return {
            "safe": "Safe check-in received. Waiting for volunteer verification.",
            "missing": "Missing-person report received. Waiting for volunteer verification.",
            "update": "Community update received. Waiting for volunteer verification.",
        }[report_kind]

    @staticmethod
    def _build_google_form_import_note(payload: GoogleFormIngestRequest) -> str:
        note_lines = [
            f"Imported from Google Form ({payload.report_kind}).",
        ]
        if payload.subject_name:
            note_lines.append(f"Subject reference: {payload.subject_name}")
        if payload.source_relationship:
            note_lines.append(f"Source relationship: {payload.source_relationship}")
        if payload.callback_allowed is not None:
            note_lines.append(f"Callback allowed: {'yes' if payload.callback_allowed else 'no'}")
        if payload.public_visibility_requested is not None:
            note_lines.append(
                f"Public visibility requested: {'yes' if payload.public_visibility_requested else 'no'}"
            )
        if payload.update_category:
            note_lines.append(f"Update category: {payload.update_category}")
        if payload.source_form_name:
            note_lines.append(f"Source form: {payload.source_form_name}")
        if payload.source_entry_id:
            note_lines.append(f"Source entry id: {payload.source_entry_id}")
        if payload.submitted_at is not None:
            note_lines.append(f"Submitted at: {payload.submitted_at.isoformat()}")
        return " ".join(note_lines)

    def _to_case_list_item(self, case: Case) -> CaseListItem:
        assigned_staff_user = None
        if case.assigned_staff_user is not None:
            assigned_staff_user = StaffUserSummary.model_validate(case.assigned_staff_user)

        return CaseListItem(
            id=case.id,
            case_code=case.case_code,
            status=case.status,
            urgency=case.urgency,
            incident_type=case.incident_type,
            location_summary=case.location_summary,
            needs_summary=case.needs_summary,
            latest_public_update=case.latest_public_update,
            assigned_staff_user=assigned_staff_user,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )

    def _to_case_detail(self, case: Case) -> CaseDetailResponse:
        base = self._to_case_list_item(case)
        return CaseDetailResponse(
            **base.model_dump(),
            language_code=case.language_code,
            reporter_name=case.reporter_name,
            reporter_email=case.reporter_email,
            reporter_phone=case.reporter_phone,
        )
