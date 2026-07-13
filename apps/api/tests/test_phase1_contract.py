from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import inspect

from app.db import Base
from app.main import app
from app.schemas.case import AnonymousCaseSubmissionRequest, StaffCaseActionRequest
from app.models.enums import CaseActionType, CaseStatus, IncidentType, ReportTriageStatus, UrgencyLevel
from app.schemas.report import StaffReportTriageDecisionRequest
from app.schemas.voice import VoiceIntakeUploadForm, VoiceTranscriptConfirmRequest


def test_openapi_includes_phase1_paths() -> None:
    schema = app.openapi()
    for path in (
        "/auth/verify-magic-link",
        "/staff/me",
        "/cases",
        "/voice-intakes",
        "/voice-intakes/retrieve",
        "/voice-intakes/confirm",
        "/staff/cases",
        "/staff/cases/{case_id}",
        "/staff/cases/{case_id}/voice",
        "/staff/cases/{case_id}/voice/audio",
        "/staff/cases/{case_id}/actions",
        "/staff/cases/{case_id}/audit",
        "/share/{token}",
    ):
        assert path in schema["paths"]


def test_case_submission_schema_validation() -> None:
    payload = AnonymousCaseSubmissionRequest(
        incident_type=IncidentType.MEDICAL,
        urgency=UrgencyLevel.HIGH,
        language_code="en",
        location_summary="Apartment stairwell, third floor",
        needs_summary="One adult with chest pain and trouble breathing.",
        voice_intake_token="voice-token-placeholder",
    )
    assert payload.urgency is UrgencyLevel.HIGH
    assert payload.voice_intake_token == "voice-token-placeholder"


def test_case_action_schema_constraints() -> None:
    action = StaffCaseActionRequest(action_type=CaseActionType.STATUS_CHANGE, to_status=CaseStatus.ACTIVE)
    assert action.to_status is CaseStatus.ACTIVE

    try:
        StaffCaseActionRequest(action_type=CaseActionType.REASSIGN)
    except ValidationError as exc:
        assert "target_staff_user_id" in str(exc)
    else:
        raise AssertionError("Expected schema validation failure for reassign without target staff user.")


def test_model_metadata_contains_phase1_tables() -> None:
    metadata = Base.metadata
    for table_name in (
        "users",
        "magic_link_tokens",
        "staff_sessions",
        "cases",
        "case_share_links",
        "case_actions",
        "audit_log_entries",
        "voice_intakes",
        "reports",
        "case_reports",
        "report_triage_actions",
    ):
        assert table_name in metadata.tables


def test_alembic_has_single_head() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == ["0004_report_first_phase1"]


def test_report_triage_schema_validation() -> None:
    decision = StaffReportTriageDecisionRequest(note="Not enough detail to identify a person.")
    assert decision.note.startswith("Not enough")
    assert ReportTriageStatus.AWAITING_REVIEW.value == "awaiting_review"


def test_voice_schema_validation() -> None:
    upload = VoiceIntakeUploadForm(language_code="EN", duration_seconds=3.5)
    assert upload.language_code == "en"

    confirm = VoiceTranscriptConfirmRequest(
        voice_intake_token="voice-token-placeholder",
        confirmed_transcript_text="Please send evacuation support.",
    )
    assert confirm.confirmed_transcript_text.startswith("Please")
