from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.case_report import CaseReport
from app.models.enums import (
    AuditActorType,
    AuditEventType,
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseStatus,
    IncidentType,
    CaseVerificationTask,
    ReportSourceChannel,
    ReportTriageActionType,
    ReportTriageStatus,
    UrgencyLevel,
)
from app.models.report import Report
from app.models.report_triage_action import ReportTriageAction
from app.models.user import User
from app.schemas.case import CaseDetailResponse
from app.schemas.google_forms import GoogleFormIngestRequest, GoogleFormIngestResponse
from app.schemas.report import (
    ReportCaseSummary,
    ReportDetailResponse,
    ReportInboxResponse,
    ReportListItem,
    ReportTriageActionResponse,
    StaffReportCreateCaseRequest,
    StaffReportCreateCaseResponse,
    StaffReportCreateTaskRequest,
    StaffReportLinkCaseRequest,
    StaffReportLinkCaseResponse,
    StaffReportNoteResponse,
    StaffReportTriageDecisionResponse,
)
from app.schemas.staff import StaffUserSummary
from app.services.case_service import CaseService
from app.services.incident_service import IncidentService
from app.services.report_attachment_service import ReportAttachmentService


class ReportService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_google_form_report(self, payload: GoogleFormIngestRequest) -> GoogleFormIngestResponse:
        incident = IncidentService(self.db).get_or_create_legacy_incident()
        report = Report(
            incident_id=incident.id,
            report_code=self._generate_report_code(),
            source_channel=ReportSourceChannel.GOOGLE_FORM,
            source_form_id=payload.source_form_id,
            source_form_name=payload.source_form_name,
            source_entry_id=payload.source_entry_id,
            submitted_at=payload.submitted_at,
            received_at=datetime.now(timezone.utc),
            language_code=payload.language_code,
            raw_answers_json=payload.model_dump(mode="json"),
            original_narrative=payload.details_summary,
            location_text=payload.location_summary,
            reporter_name=payload.reporter_name,
            reporter_email=str(payload.reporter_email) if payload.reporter_email else None,
            reporter_phone=payload.reporter_phone,
            reporter_relationship=payload.source_relationship,
            is_first_hand=payload.is_first_hand,
            permission_to_contact=payload.callback_allowed,
            subject_type=payload.subject_type,
            triage_status=ReportTriageStatus.AWAITING_REVIEW,
        )
        self.db.add(report)

        try:
            self.db.flush()
            ReportAttachmentService(self.db).link_code_to_report(
                incident_id=report.incident_id,
                report_id=report.id,
                attachment_code=payload.attachment_code,
            )
            self.db.add(
                AuditLogEntry(
                    actor_type=AuditActorType.SYSTEM,
                    event_type=AuditEventType.REPORT_RECEIVED,
                    metadata_json={
                        "report_id": report.id,
                        "report_code": report.report_code,
                        "source_channel": report.source_channel.value,
                        "source_form_id": report.source_form_id,
                        "source_entry_id": report.source_entry_id,
                    },
                )
            )
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            existing = self._get_existing_source_report(payload)
            if existing is None:
                raise
            return self._to_google_form_response(existing)

        self.db.refresh(report)
        return self._to_google_form_response(report)

    def list_reports(
        self,
        *,
        triage_status: Optional[ReportTriageStatus] = None,
        incident_id: Optional[int] = None,
    ) -> ReportInboxResponse:
        statement = select(Report).order_by(Report.received_at.desc(), Report.id.desc())
        if triage_status is not None:
            statement = statement.where(Report.triage_status == triage_status)
        if incident_id is not None:
            statement = statement.where(Report.incident_id == incident_id)
        reports = self.db.scalars(statement).all()
        return ReportInboxResponse(reports=[self._to_list_item(report) for report in reports])

    def get_report(self, report_id: int) -> Optional[ReportDetailResponse]:
        report = self.db.get(Report, report_id)
        if report is None:
            return None
        return self._to_detail(report)

    def create_case_from_report(
        self,
        report_id: int,
        actor: StaffUserSummary,
        payload: StaffReportCreateCaseRequest,
    ) -> StaffReportCreateCaseResponse:
        report = self._get_report_for_triage(report_id)
        self._ensure_report_can_be_linked(report)

        if payload.assigned_staff_user_id is not None and self.db.get(User, payload.assigned_staff_user_id) is None:
            raise ValueError("Assigned staff user not found.")

        legacy_status = CaseService.project_legacy_status(payload.safety_status, payload.handling_status)
        case = Case(
            incident_id=report.incident_id,
            case_code=CaseService._generate_case_code(),
            status=legacy_status,
            urgency=payload.urgency,
            incident_type=payload.incident_type,
            language_code=report.language_code,
            location_summary=payload.location_summary,
            needs_summary=payload.needs_summary,
            latest_public_update=None,
            subject_type=report.subject_type,
            person_label=payload.person_label,
            approximate_age=payload.approximate_age,
            appearance=payload.appearance,
            clothing=payload.clothing,
            identifying_details=payload.identifying_details,
            mobility=payload.mobility,
            companions=payload.companions,
            last_known_location=payload.last_known_location,
            last_known_time=payload.last_known_time,
            safety_status=payload.safety_status,
            handling_status=payload.handling_status,
            verification_task=payload.verification_task,
            assigned_staff_user_id=payload.assigned_staff_user_id,
        )
        self.db.add(case)
        self.db.flush()
        ReportAttachmentService(self.db).link_report_attachments_to_case(report_id=report.id, case_id=case.id)

        action = self._link_report_to_case(
            report=report,
            case=case,
            actor=actor,
            action_type=ReportTriageActionType.CREATE_CASE,
            link_reason=payload.link_reason,
            note=payload.note,
        )
        self.db.commit()
        self.db.refresh(case)
        self.db.refresh(report)
        self.db.refresh(action)

        case_detail = CaseService(self.db).get_case(case.id)
        if case_detail is None:
            raise LookupError("Case not found after creation.")
        return StaffReportCreateCaseResponse(
            report=self._to_detail(report),
            case=case_detail,
            action=ReportTriageActionResponse.model_validate(action),
        )

    def create_task_from_report(
        self,
        report_id: int,
        actor: StaffUserSummary,
        payload: StaffReportCreateTaskRequest,
    ) -> StaffReportCreateCaseResponse:
        report = self._get_report_for_triage(report_id)
        self._ensure_report_can_be_linked(report)
        case = Case(
            incident_id=report.incident_id,
            case_code=CaseService._generate_case_code(),
            status=CaseStatus.PENDING_REVIEW,
            urgency=UrgencyLevel.MEDIUM,
            incident_type=IncidentType.OTHER,
            language_code=report.language_code,
            location_summary=report.location_text,
            needs_summary=report.original_narrative,
            latest_public_update=None,
            subject_type=report.subject_type,
            person_label=self._raw_answer_text(report, "person_name") or report.reporter_name,
            approximate_age=self._raw_answer_text(report, "approximate_age"),
            identifying_details=self._raw_answer_text(report, "identifying_description"),
            last_known_location=report.location_text,
            safety_status=CaseSafetyStatus.UNKNOWN,
            handling_status=CaseHandlingStatus.AWAITING_ACTION,
            verification_task=CaseVerificationTask.NONE,
        )
        self.db.add(case)
        self.db.flush()
        ReportAttachmentService(self.db).link_report_attachments_to_case(report_id=report.id, case_id=case.id)
        action = self._link_report_to_case(
            report=report,
            case=case,
            actor=actor,
            action_type=ReportTriageActionType.CREATE_CASE,
            link_reason="Created follow-up task from incoming report.",
            note=payload.note,
        )
        self.db.commit()
        self.db.refresh(case)
        self.db.refresh(report)
        self.db.refresh(action)
        case_detail = CaseService(self.db).get_case(case.id)
        if case_detail is None:
            raise LookupError("Case not found after creation.")
        return StaffReportCreateCaseResponse(
            report=self._to_detail(report),
            case=case_detail,
            action=ReportTriageActionResponse.model_validate(action),
        )

    def link_report_to_case(
        self,
        report_id: int,
        actor: StaffUserSummary,
        payload: StaffReportLinkCaseRequest,
    ) -> StaffReportLinkCaseResponse:
        report = self._get_report_for_triage(report_id)
        self._ensure_report_can_be_linked(report)
        case = self.db.get(Case, payload.case_id)
        if case is None:
            raise LookupError("Case not found.")
        if case.incident_id != report.incident_id:
            raise ValueError("Report and case belong to different incidents.")
        ReportAttachmentService(self.db).link_report_attachments_to_case(report_id=report.id, case_id=case.id)

        action = self._link_report_to_case(
            report=report,
            case=case,
            actor=actor,
            action_type=ReportTriageActionType.LINK_EXISTING_CASE,
            link_reason=payload.link_reason,
            note=payload.note,
        )
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ValueError("Report is already linked to a case.") from exc

        self.db.refresh(report)
        self.db.refresh(action)
        case_detail = CaseService(self.db).get_case(case.id)
        if case_detail is None:
            raise LookupError("Case not found after linking.")
        return StaffReportLinkCaseResponse(
            report=self._to_detail(report),
            case=case_detail,
            action=ReportTriageActionResponse.model_validate(action),
        )

    def mark_out_of_scope(
        self,
        report_id: int,
        actor: StaffUserSummary,
        note: str,
    ) -> StaffReportTriageDecisionResponse:
        return self._mark_report(
            report_id=report_id,
            actor=actor,
            to_status=ReportTriageStatus.OUT_OF_SCOPE,
            action_type=ReportTriageActionType.MARK_OUT_OF_SCOPE,
            note=note,
        )

    def mark_invalid_or_insufficient(
        self,
        report_id: int,
        actor: StaffUserSummary,
        note: str,
    ) -> StaffReportTriageDecisionResponse:
        return self._mark_report(
            report_id=report_id,
            actor=actor,
            to_status=ReportTriageStatus.INVALID_OR_INSUFFICIENT,
            action_type=ReportTriageActionType.MARK_INVALID_OR_INSUFFICIENT,
            note=note,
        )

    def add_note(self, report_id: int, actor: StaffUserSummary, note: str) -> StaffReportNoteResponse:
        report = self.db.get(Report, report_id)
        if report is None:
            raise LookupError("Report not found.")
        action = ReportTriageAction(
            report_id=report.id,
            actor_user_id=actor.id,
            action_type=ReportTriageActionType.NOTE,
            from_status=report.triage_status,
            to_status=report.triage_status,
            note=note,
        )
        self.db.add(action)
        self.db.add(self._report_audit(report, actor, action_type=ReportTriageActionType.NOTE, note=note))
        self.db.commit()
        self.db.refresh(action)
        self.db.refresh(report)
        return StaffReportNoteResponse(
            report=self._to_detail(report),
            action=ReportTriageActionResponse.model_validate(action),
        )

    def _mark_report(
        self,
        *,
        report_id: int,
        actor: StaffUserSummary,
        to_status: ReportTriageStatus,
        action_type: ReportTriageActionType,
        note: str,
    ) -> StaffReportTriageDecisionResponse:
        report = self._get_report_for_triage(report_id)
        if report.case_link is not None:
            raise ValueError("Linked reports cannot be marked out of scope or invalid.")

        from_status = report.triage_status
        report.triage_status = to_status
        report.triaged_at = datetime.now(timezone.utc)
        report.triaged_by_user_id = actor.id
        action = ReportTriageAction(
            report_id=report.id,
            actor_user_id=actor.id,
            action_type=action_type,
            from_status=from_status,
            to_status=to_status,
            note=note,
        )
        self.db.add(action)
        self.db.add(self._report_audit(report, actor, action_type=action_type, note=note))
        self.db.commit()
        self.db.refresh(report)
        self.db.refresh(action)
        return StaffReportTriageDecisionResponse(
            report=self._to_detail(report),
            action=ReportTriageActionResponse.model_validate(action),
        )

    def _link_report_to_case(
        self,
        *,
        report: Report,
        case: Case,
        actor: StaffUserSummary,
        action_type: ReportTriageActionType,
        link_reason: Optional[str],
        note: Optional[str],
    ) -> ReportTriageAction:
        from_status = report.triage_status
        to_status = (
            ReportTriageStatus.LINKED_TO_NEW_CASE
            if action_type == ReportTriageActionType.CREATE_CASE
            else ReportTriageStatus.LINKED_TO_EXISTING_CASE
        )
        report.triage_status = to_status
        report.triaged_at = datetime.now(timezone.utc)
        report.triaged_by_user_id = actor.id
        self.db.add(
            CaseReport(
                case_id=case.id,
                report_id=report.id,
                linked_by_user_id=actor.id,
                link_reason=link_reason,
            )
        )
        action = ReportTriageAction(
            report_id=report.id,
            actor_user_id=actor.id,
            action_type=action_type,
            from_status=from_status,
            to_status=to_status,
            case_id=case.id,
            note=note,
        )
        self.db.add(action)
        self.db.add(
            self._report_audit(
                report,
                actor,
                action_type=action_type,
                case_id=case.id,
                note=note,
            )
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case.id,
                event_type=AuditEventType.REPORT_LINKED_TO_CASE,
                metadata_json={
                    "report_id": report.id,
                    "report_code": report.report_code,
                    "action_type": action_type.value,
                },
            )
        )
        return action

    def _get_report_for_triage(self, report_id: int) -> Report:
        report = self.db.get(Report, report_id)
        if report is None:
            raise LookupError("Report not found.")
        return report

    @staticmethod
    def _ensure_report_can_be_linked(report: Report) -> None:
        if report.case_link is not None or report.triage_status in {
            ReportTriageStatus.LINKED_TO_CASE,
            ReportTriageStatus.LINKED_TO_NEW_CASE,
            ReportTriageStatus.LINKED_TO_EXISTING_CASE,
        }:
            raise ValueError("Report is already linked to a case.")
        if report.triage_status in {
            ReportTriageStatus.OUT_OF_SCOPE,
            ReportTriageStatus.INVALID_OR_INSUFFICIENT,
        }:
            raise ValueError("Report has already been triaged.")

    def _get_existing_source_report(self, payload: GoogleFormIngestRequest) -> Optional[Report]:
        if not payload.source_form_id or not payload.source_entry_id:
            return None
        return self.db.scalar(
            select(Report).where(
                Report.source_channel == ReportSourceChannel.GOOGLE_FORM,
                Report.source_form_id == payload.source_form_id,
                Report.source_entry_id == payload.source_entry_id,
            )
        )

    def _to_google_form_response(self, report: Report) -> GoogleFormIngestResponse:
        return GoogleFormIngestResponse(
            id=report.id,
            report_code=report.report_code,
            triage_status=report.triage_status,
            source="google_form",
            received_at=report.received_at,
        )

    def _to_list_item(self, report: Report) -> ReportListItem:
        return ReportListItem(
            id=report.id,
            incident_id=report.incident_id,
            intake_source_id=report.intake_source_id,
            report_code=report.report_code,
            source_channel=report.source_channel,
            source_form_id=report.source_form_id,
            source_form_name=report.source_form_name,
            source_entry_id=report.source_entry_id,
            submitted_at=report.submitted_at,
            received_at=report.received_at,
            language_code=report.language_code,
            triage_status=report.triage_status,
            reporter_relationship=report.reporter_relationship,
            is_first_hand=report.is_first_hand,
            permission_to_contact=report.permission_to_contact,
            subject_type=report.subject_type,
            location_text=report.location_text,
            original_narrative_preview=self._preview(report.original_narrative),
            submission_type=self._raw_answer_text(report, "submission_type"),
            person_name=self._raw_answer_text(report, "person_name") or report.reporter_name,
            approximate_age=self._raw_answer_text(report, "approximate_age"),
            gender=self._raw_answer_text(report, "gender"),
            current_status=self._raw_answer_text(report, "current_status"),
            linked_case=self._to_case_summary(report.case_link.case) if report.case_link else None,
            legacy_case_id=report.legacy_case_id,
            is_legacy_backfill=report.is_legacy_backfill,
            migration_note=report.migration_note,
            source_label=self._source_label(report),
            attachments=ReportAttachmentService(self.db).list_report_attachments(report.id),
        )

    def _to_detail(self, report: Report) -> ReportDetailResponse:
        base = self._to_list_item(report)
        return ReportDetailResponse(
            **base.model_dump(),
            raw_answers_json=report.raw_answers_json,
            original_narrative=report.original_narrative,
            reporter_name=report.reporter_name,
            reporter_email=report.reporter_email,
            reporter_phone=report.reporter_phone,
            media_refs_json=report.media_refs_json,
            voice_intake_id=report.voice_intake_id,
            triage_actions=[
                ReportTriageActionResponse.model_validate(action)
                for action in sorted(report.triage_actions, key=lambda item: item.created_at)
            ],
        )

    @staticmethod
    def _to_case_summary(case: Case) -> ReportCaseSummary:
        return ReportCaseSummary(
            id=case.id,
            incident_id=case.incident_id,
            case_code=case.case_code,
            person_label=case.person_label,
            subject_type=case.subject_type,
            safety_status=case.safety_status,
            handling_status=case.handling_status,
        )

    @staticmethod
    def _source_label(report: Report) -> str:
        if report.intake_source_id is not None:
            return "Google Forms / Google Sheets intake"
        return report.source_channel.value

    @staticmethod
    def _raw_answer_text(report: Report, key: str) -> Optional[str]:
        if not isinstance(report.raw_answers_json, dict):
            return None
        value = report.raw_answers_json.get(key)
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _report_audit(
        report: Report,
        actor: StaffUserSummary,
        *,
        action_type: ReportTriageActionType,
        case_id: Optional[int] = None,
        note: Optional[str] = None,
    ) -> AuditLogEntry:
        return AuditLogEntry(
            actor_type=AuditActorType.STAFF,
            actor_user_id=actor.id,
            case_id=case_id,
            event_type=AuditEventType.REPORT_TRIAGED,
            metadata_json={
                "report_id": report.id,
                "report_code": report.report_code,
                "action_type": action_type.value,
                "triage_status": report.triage_status.value,
                "note": note,
            },
        )

    @staticmethod
    def _preview(value: str, limit: int = 220) -> str:
        normalized = " ".join(value.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[: limit - 3].rstrip()}..."

    @staticmethod
    def _generate_report_code(length: int = 10) -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "RPT-" + "".join(secrets.choice(alphabet) for _ in range(length))
