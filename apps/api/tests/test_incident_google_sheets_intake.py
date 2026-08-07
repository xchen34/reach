from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
from app.models.case import Case
from app.models.enums import (
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseStatus,
    CaseVerificationTask,
    AttachmentModerationStatus,
    IncidentStatus,
    IncidentType,
    IntakeSourceType,
    ReportSourceChannel,
    ReportTriageStatus,
    StaffRole,
    SubjectType,
    UrgencyLevel,
)
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource
from app.models.report import Report
from app.models.report_attachment import ReportAttachment
from app.models.user import User
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ/viewform"
GOOGLE_SPREADSHEET_ID = "1EILq0xRcEhXziEtvHTV3agkAl2hiDrUVVfaHz_vYGmw"

SHEET_HEADERS = [
    "Horodateur",
    "What are you submitting?",
    "If update , what has changed?",
    "Previous Report or Case Reference (Optional)",
    "Full Name of the Person Being Reported",
    "Other Name or Nickname (Optional)",
    "Approximate Age",
    "Gender",
    "Phone Number of the Person (Optional)",
    "Physical or Identifying Description",
    "What is currently known about this person?",
    "What is currently known about the person's situation?",
    "Exact Address or Last Confirmed Location",
    "Building or Residence Name (Optional)",
    "Block or Tower (Optional)",
    "Floor (Optional)",
    "Apartment or Unit Number (Optional)",
    "Entrance or Access Instructions (Optional)",
    "Date and Time Last Successfully Contacted or Seen",
    "Possible Current Location (Optional)",
    "Does any of the following apply to the person?",
    "Essential Medication, Equipment or Assistance Needs (Optional)",
    "Are other people believed to be at the same address?",
    "If yes, provide any known details (Optional)",
    "Who has already been contacted?",
    "What was the result of those checks or contacts? (Optional)",
    "What is the source of this information?",
    "How would you like to submit this report?",
    "Your Name",
    "Your Relationship to the Person",
    "Preferred Contact Method",
    "Consent and Acknowledgment",
    "Unexpected Extra Column",
    "subject_type",
    "Reach photo attachment code",
]


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setenv("Reach_DEV_DEFAULT_ROLE", "volunteer")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_public_incident_report_page_exposes_form_but_not_sheet() -> None:
    incident_id, _ = _create_incident_with_source()

    response = client.get("/incidents/high-rise-fire/report")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == incident_id
    assert payload["google_form_url"] == GOOGLE_FORM_URL
    assert "google_spreadsheet_id" not in payload
    assert GOOGLE_SPREADSHEET_ID not in response.text


def test_current_public_incident_report_page_exposes_active_intake_only() -> None:
    incident_id, _ = _create_incident_with_source(slug="reach-demo")

    response = client.get("/incidents/current/report")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == incident_id
    assert payload["slug"] == "reach-demo"
    assert payload["google_form_url"] == GOOGLE_FORM_URL
    assert GOOGLE_SPREADSHEET_ID not in response.text


def test_inactive_incident_does_not_expose_intake() -> None:
    _create_incident_with_source(status=IncidentStatus.INTAKE_PAUSED)

    response = client.get("/incidents/high-rise-fire/report")

    assert response.status_code == 404


def test_import_creates_idempotent_incident_scoped_report(monkeypatch: pytest.MonkeyPatch) -> None:
    incident_id, source_id = _create_incident_with_source()
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: [SHEET_HEADERS, _sheet_row(), [], _malformed_timestamp_row()],
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    first_response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )
    second_response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert first_response.status_code == 200
    assert first_response.json()["imported"] == 2
    assert first_response.json()["skipped"] == 1
    assert second_response.status_code == 200
    assert second_response.json()["imported"] == 0

    reports_response = client.get(f"/staff/reports?incident_id={incident_id}", headers=headers)
    assert reports_response.status_code == 200
    report_items = reports_response.json()["reports"]
    assert len(report_items) == 2
    assert report_items[0]["submission_type"] == "A new report about a person"
    assert report_items[0]["person_name"] == "Resident B"
    assert report_items[0]["approximate_age"] == "72"
    assert report_items[0]["gender"] == "Female"
    assert report_items[0]["current_status"] == "Family cannot reach her."
    assert report_items[0]["subject_type"] == "person"

    with next(override_get_db()) as db:
        reports = db.query(Report).order_by(Report.id).all()
        assert len(reports) == 2
        assert {report.incident_id for report in reports} == {incident_id}
        assert reports[0].intake_source_id == source_id
        assert reports[0].triage_status.value == "awaiting_review"
        assert reports[0].raw_answers_json["person_name"] == "Resident A"
        assert reports[0].subject_type == SubjectType.PERSON
        assert reports[0].raw_answers_json["unknown_columns"]["Unexpected Extra Column"] == "preserved"
        assert reports[1].submitted_at is None
        assert db.query(Case).count() == 0


def test_import_rescans_existing_rows_and_withdraws_missing_source_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    incident_id, source_id = _create_incident_with_source()
    first_rows = [
        SHEET_HEADERS,
        _sheet_row(name="Resident A", timestamp="07/13/2026 12:27:00"),
        _sheet_row(name="Resident B", timestamp="07/13/2026 12:31:00"),
    ]
    second_rows = [SHEET_HEADERS, _sheet_row(name="Resident A Updated", timestamp="07/13/2026 12:27:00")]
    rows_by_call = [first_rows, second_rows]

    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows_by_call.pop(0),
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    first_response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )
    second_response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert first_response.status_code == 200
    assert first_response.json()["imported"] == 2
    assert second_response.status_code == 200
    assert second_response.json()["imported"] == 0
    assert second_response.json()["last_imported_row"] == 2

    reports_response = client.get(f"/staff/reports?incident_id={incident_id}", headers=headers)
    assert reports_response.status_code == 200
    report_items = reports_response.json()["reports"]
    assert len(report_items) == 1
    assert report_items[0]["person_name"] == "Resident A Updated"

    with next(override_get_db()) as db:
        reports = db.query(Report).order_by(Report.id).all()
        # The vanished row is retained, only flagged — intake evidence must not be
        # destroyed just because someone tidied the spreadsheet.
        assert len(reports) == 2
        live = [report for report in reports if report.source_row_withdrawn_at is None]
        withdrawn = [report for report in reports if report.source_row_withdrawn_at is not None]
        assert len(live) == 1
        assert live[0].raw_answers_json["person_name"] == "Resident A Updated"
        assert live[0].source_entry_id == "Form Responses 1:07/13/2026 12:27:00"
        assert len(withdrawn) == 1
        assert withdrawn[0].raw_answers_json["person_name"] == "Resident B"


def test_import_defaults_missing_subject_type_to_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    incident_id, source_id = _create_incident_with_source()
    legacy_headers = SHEET_HEADERS[:-2]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: [legacy_headers, _sheet_row()[:-2]],
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert response.status_code == 200
    with next(override_get_db()) as db:
        report = db.query(Report).one()
        assert report.subject_type == SubjectType.UNKNOWN


def test_attachment_upload_linking_and_public_filtering(monkeypatch: pytest.MonkeyPatch) -> None:
    incident_id, source_id = _create_incident_with_source()
    upload_response = client.post(
        "/public/incidents/high-rise-fire/attachments",
        files={"images": ("pet.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
    )
    assert upload_response.status_code == 201
    attachment_code = upload_response.json()["attachment_code"]
    row = _sheet_row(subject_type="pet", attachment_code=attachment_code)
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: [SHEET_HEADERS, row],
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    first_import = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )
    second_import = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert first_import.status_code == 200
    assert first_import.json()["imported"] == 1
    assert second_import.status_code == 200
    assert second_import.json()["imported"] == 0

    reports_response = client.get(f"/staff/reports?incident_id={incident_id}", headers=headers)
    report = reports_response.json()["reports"][0]
    assert report["subject_type"] == "pet"
    assert len(report["attachments"]) == 1
    assert "storage_key" not in report["attachments"][0]
    report_id = report["id"]

    create_task = client.post(f"/staff/reports/{report_id}/create-task", headers=headers, json={})
    assert create_task.status_code == 200
    case_id = create_task.json()["case"]["id"]
    assert create_task.json()["case"]["subject_type"] == "pet"
    assert create_task.json()["case"]["attachments"][0]["moderation_status"] == "pending"

    pending_board = client.get("/board")
    assert pending_board.status_code == 200
    assert pending_board.json()["records"][0]["subject_type"] == "pet"
    assert pending_board.json()["records"][0]["public_image"] is None

    with next(override_get_db()) as db:
        attachment = db.query(ReportAttachment).one()
        attachment.public_visibility = True
        attachment.moderation_status = AttachmentModerationStatus.APPROVED
        db.commit()

    approved_board = client.get("/board")
    public_image = approved_board.json()["records"][0]["public_image"]
    assert public_image["url"] == f"/public/attachments/{public_image['id']}/content"
    assert "storage_key" not in public_image
    assert db_case_subject(case_id) == SubjectType.PET


def test_attachment_code_can_be_backfilled_on_rerun(monkeypatch: pytest.MonkeyPatch) -> None:
    incident_id, source_id = _create_incident_with_source()
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: [SHEET_HEADERS, _sheet_row(subject_type="pet")],
    )

    first_import = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )
    assert first_import.status_code == 200
    assert first_import.json()["imported"] == 1

    upload_response = client.post(
        "/public/incidents/high-rise-fire/attachments",
        files={"images": ("pet.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
    )
    assert upload_response.status_code == 201
    attachment_code = upload_response.json()["attachment_code"]

    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: [SHEET_HEADERS, _sheet_row(subject_type="pet", attachment_code=attachment_code)],
    )

    second_import = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert second_import.status_code == 200
    assert second_import.json()["imported"] == 0
    assert second_import.json()["skipped"] == 1

    with next(override_get_db()) as db:
        report = db.query(Report).one()
        assert len(report.attachments) == 1
        assert report.attachments[0].attachment_code == attachment_code
        assert report.attachments[0].report_id == report.id


def test_attachment_upload_rejects_invalid_type_and_oversize(monkeypatch: pytest.MonkeyPatch) -> None:
    _create_incident_with_source()
    monkeypatch.setenv("Reach_REPORT_ATTACHMENT_MAX_UPLOAD_BYTES", "8")
    get_settings.cache_clear()

    invalid = client.post(
        "/public/incidents/high-rise-fire/attachments",
        files={"images": ("bad.svg", b"<svg/>", "image/svg+xml")},
    )
    oversize = client.post(
        "/public/incidents/high-rise-fire/attachments",
        files={"images": ("large.png", b"\x89PNG\r\n\x1a\nx", "image/png")},
    )

    assert invalid.status_code == 400
    assert oversize.status_code == 413


def test_volunteer_cannot_trigger_import() -> None:
    incident_id, source_id = _create_incident_with_source()
    headers = _authenticate_staff("volunteer@example.com", StaffRole.VOLUNTEER)

    response = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import",
        headers=headers,
    )

    assert response.status_code == 403


def test_cross_incident_report_case_link_is_rejected() -> None:
    first_incident_id, source_id = _create_incident_with_source(slug="incident-one")
    second_incident_id, _ = _create_incident_with_source(slug="incident-two")
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    with next(override_get_db()) as db:
        report = Report(
            incident_id=first_incident_id,
            intake_source_id=source_id,
            report_code="RPT-CROSS",
            source_channel=ReportSourceChannel.GOOGLE_FORM,
            source_form_id=GOOGLE_SPREADSHEET_ID,
            source_form_name="Form Responses 1",
            source_entry_id="Form Responses 1:2",
            received_at=datetime.now(timezone.utc),
            language_code="en",
            raw_answers_json={"person_name": "Resident A"},
            original_narrative="Imported report.",
            location_text="Tower A",
            triage_status=ReportTriageStatus.AWAITING_REVIEW,
        )
        case = Case(
            incident_id=second_incident_id,
            case_code="CASE-CROSS",
            status=CaseStatus.PENDING_REVIEW,
            urgency=UrgencyLevel.HIGH,
            incident_type=IncidentType.OTHER,
            language_code="en",
            location_summary="Tower B",
            needs_summary="Different incident case.",
            safety_status=CaseSafetyStatus.UNKNOWN,
            handling_status=CaseHandlingStatus.AWAITING_ACTION,
            verification_task=CaseVerificationTask.NONE,
        )
        db.add_all([report, case])
        db.commit()
        report_id = report.id
        case_id = case.id

    response = client.post(
        f"/staff/reports/{report_id}/link-case",
        headers=headers,
        json={"case_id": case_id, "link_reason": "Should be blocked."},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Report and case belong to different incidents."


def _create_incident_with_source(
    *,
    slug: str = "high-rise-fire",
    status: IncidentStatus = IncidentStatus.ACTIVE,
) -> tuple[int, int]:
    with next(override_get_db()) as db:
        incident = Incident(
            internal_name=f"{slug} internal",
            public_name="High Rise Fire Response",
            slug=slug,
            disaster_type="building_fire",
            affected_area="North Tower, Riverside Estate",
            public_description="Report a missing or unreachable person connected to this incident.",
            supported_languages=["en", "fr", "zh"],
            status=status,
            form_opening_time=datetime(2026, 7, 13, tzinfo=timezone.utc),
            owning_team="Test coordination team",
        )
        db.add(incident)
        db.flush()
        source = IncidentIntakeSource(
            incident_id=incident.id,
            source_type=IntakeSourceType.GOOGLE_SHEETS,
            google_form_url=GOOGLE_FORM_URL,
            google_form_id="1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ",
            google_spreadsheet_id=GOOGLE_SPREADSHEET_ID,
            google_sheet_name="Form Responses 1",
            last_imported_row=1,
            is_active=True,
        )
        db.add(source)
        db.commit()
        return incident.id, source.id


def _authenticate_staff(email: str, role: StaffRole) -> dict[str, str]:
    with next(override_get_db()) as db:
        user = db.query(User).filter(User.email == email).one_or_none()
        if user is None:
            user = User(email=email, role=role)
            db.add(user)
        else:
            user.role = role
        db.commit()

    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _sheet_row(
    *,
    subject_type: str = "person",
    attachment_code: str = "",
    name: str = "Resident A",
    timestamp: str = "07/13/2026 12:27:00",
) -> list[str]:
    return [
        timestamp,
        "A new report about a person",
        "",
        "",
        name,
        "Res A",
        "72",
        "Female",
        "+1 555 0200",
        "Gray hair, red coat",
        "Family cannot reach her.",
        "May still be inside the tower.",
        "12 North Tower",
        "North Tower",
        "B",
        "10",
        "1002",
        "Use east stairwell",
        "07/13/2026 10:00",
        "Possibly apartment 1002",
        "Limited mobility, Essential medication",
        "Insulin",
        "Yes",
        "Spouse may be present.",
        "Building manager",
        "No answer at door.",
        "Family member",
        "With my name",
        "Reporter A",
        "Daughter",
        "reporter@example.com",
        "I confirm this is accurate.",
        "preserved",
        subject_type,
        attachment_code,
    ]


def _malformed_timestamp_row() -> list[str]:
    row = _sheet_row()
    row[0] = "not a timestamp"
    row[4] = "Resident B"
    row[30] = "+1 555 9999"
    row[32] = "extra"
    return row


def db_case_subject(case_id: int) -> SubjectType:
    with next(override_get_db()) as db:
        return db.get(Case, case_id).subject_type


def test_inserting_a_row_does_not_overwrite_another_persons_report(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Row numbers shift when a row is inserted, so identity cannot be positional.

    Before the stable row key, importing after an insert matched row N to the
    report that used to be at row N and overwrote it with a different person.
    """
    incident_id, source_id = _create_incident_with_source()
    first_rows = [
        SHEET_HEADERS,
        _sheet_row(name="Amina Diallo", timestamp="07/13/2026 09:00:00"),
        _sheet_row(name="Bruno Costa", timestamp="07/13/2026 09:05:00"),
    ]
    # A new submission is pasted above the existing two, shifting both down.
    second_rows = [
        SHEET_HEADERS,
        _sheet_row(name="Chen Wei", timestamp="07/13/2026 09:02:00"),
        _sheet_row(name="Amina Diallo", timestamp="07/13/2026 09:00:00"),
        _sheet_row(name="Bruno Costa", timestamp="07/13/2026 09:05:00"),
    ]
    rows_by_call = [first_rows, second_rows]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows_by_call.pop(0),
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)

    client.post(f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import", headers=headers)
    second = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import", headers=headers
    )

    assert second.status_code == 200
    assert second.json()["imported"] == 1, "only the pasted row is new"

    with next(override_get_db()) as db:
        names = sorted(
            report.raw_answers_json["person_name"]
            for report in db.query(Report).all()
            if report.source_row_withdrawn_at is None
        )
    assert names == ["Amina Diallo", "Bruno Costa", "Chen Wei"]


def test_reimport_after_spreadsheet_is_repointed_does_not_duplicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The dedupe lookup used to require a matching source_form_id.

    Re-pointing an intake source at a different spreadsheet therefore hid every
    previously imported report and duplicated all of them on the next import.
    """
    incident_id, source_id = _create_incident_with_source()
    rows = [
        SHEET_HEADERS,
        _sheet_row(name="Amina Diallo", timestamp="07/13/2026 09:00:00"),
        _sheet_row(name="Bruno Costa", timestamp="07/13/2026 09:05:00"),
    ]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows,
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)
    client.post(f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import", headers=headers)

    with next(override_get_db()) as db:
        source = db.get(IncidentIntakeSource, source_id)
        source.google_spreadsheet_id = "1NEWSPREADSHEETIDxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        db.commit()

    second = client.post(
        f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import", headers=headers
    )

    assert second.status_code == 200
    assert second.json()["imported"] == 0, "the same rows must not import twice"
    with next(override_get_db()) as db:
        assert db.query(Report).count() == 2


def test_withdrawn_report_is_restored_when_the_row_comes_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    incident_id, source_id = _create_incident_with_source()
    present = [SHEET_HEADERS, _sheet_row(name="Amina Diallo", timestamp="07/13/2026 09:00:00")]
    removed = [SHEET_HEADERS]
    rows_by_call = [present, removed, present]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows_by_call.pop(0),
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)
    url = f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import"

    client.post(url, headers=headers)
    client.post(url, headers=headers)
    with next(override_get_db()) as db:
        report = db.query(Report).one()
        assert report.source_row_withdrawn_at is not None
    hidden = client.get(f"/staff/reports?incident_id={incident_id}", headers=headers)
    assert hidden.json()["reports"] == []

    client.post(url, headers=headers)
    with next(override_get_db()) as db:
        report = db.query(Report).one()
        assert report.source_row_withdrawn_at is None
    restored = client.get(f"/staff/reports?incident_id={incident_id}", headers=headers)
    assert len(restored.json()["reports"]) == 1


def test_auto_sync_imports_every_active_source_without_a_signed_in_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The scheduled pull has no actor, so it must attribute itself to the system."""
    from app.models.audit_log_entry import AuditLogEntry
    from app.models.enums import AuditActorType, AuditEventType
    from app.services.intake_auto_sync import run_auto_sync_once

    incident_id, source_id = _create_incident_with_source()
    rows = [SHEET_HEADERS, _sheet_row(name="Amina Diallo", timestamp="07/13/2026 09:00:00")]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows,
    )
    monkeypatch.setattr("app.services.intake_auto_sync.SessionLocal", lambda: next(override_get_db()))

    totals = run_auto_sync_once()

    assert totals["sources"] == 1
    assert totals["imported"] == 1
    assert totals["failed_sources"] == 0

    with next(override_get_db()) as db:
        assert db.query(Report).count() == 1
        entry = (
            db.query(AuditLogEntry)
            .filter(AuditLogEntry.event_type == AuditEventType.INTAKE_SOURCE_IMPORTED)
            .one()
        )
        assert entry.actor_type == AuditActorType.SYSTEM
        assert entry.actor_user_id is None


def test_auto_sync_keeps_going_when_one_source_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """One unreachable sheet must not stop the others or kill the loop."""
    from app.services.intake_auto_sync import run_auto_sync_once

    incident_id, source_id = _create_incident_with_source()
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: (_ for _ in ()).throw(RuntimeError("sheet down")),
    )
    monkeypatch.setattr("app.services.intake_auto_sync.SessionLocal", lambda: next(override_get_db()))

    totals = run_auto_sync_once()

    assert totals["sources"] == 1
    assert totals["failed_sources"] == 1
    assert totals["imported"] == 0


def test_same_second_submissions_survive_a_reordered_sheet(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Form timestamps are second-precise, so two people can share one.

    Disambiguating those by row position meant that sorting the sheet, or
    inserting a row above them, swapped their keys and one person's report
    overwrote the other's.
    """
    incident_id, source_id = _create_incident_with_source()
    stamp = "07/13/2026 09:00:00"
    amina = _sheet_row(name="Amina Diallo", timestamp=stamp)
    bruno = _sheet_row(name="Bruno Costa", timestamp=stamp)

    first_rows = [SHEET_HEADERS, amina, bruno]
    # Same two people, opposite order, plus a row pasted above them.
    second_rows = [
        SHEET_HEADERS,
        _sheet_row(name="Chen Wei", timestamp="07/13/2026 09:30:00"),
        bruno,
        amina,
    ]
    rows_by_call = [first_rows, second_rows]
    monkeypatch.setattr(
        "app.services.google_sheets_importer.GoogleSheetsApiRowReader.read_rows",
        lambda self, *, spreadsheet_id, sheet_name: rows_by_call.pop(0),
    )
    headers = _authenticate_staff("coordinator@example.com", StaffRole.COORDINATOR)
    url = f"/staff/incidents/{incident_id}/intake-sources/{source_id}/import"

    client.post(url, headers=headers)
    second = client.post(url, headers=headers)

    assert second.status_code == 200
    assert second.json()["imported"] == 1, "only the pasted row is new"

    with next(override_get_db()) as db:
        live = [r for r in db.query(Report).all() if r.source_row_withdrawn_at is None]
        names = sorted(report.raw_answers_json["person_name"] for report in live)
    # Nobody was overwritten and nobody was duplicated.
    assert names == ["Amina Diallo", "Bruno Costa", "Chen Wei"]
