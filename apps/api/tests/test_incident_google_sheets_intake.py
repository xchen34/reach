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
    IncidentStatus,
    IncidentType,
    IntakeSourceType,
    ReportSourceChannel,
    ReportTriageStatus,
    StaffRole,
    UrgencyLevel,
)
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource
from app.models.report import Report
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

    with next(override_get_db()) as db:
        reports = db.query(Report).order_by(Report.id).all()
        assert len(reports) == 2
        assert {report.incident_id for report in reports} == {incident_id}
        assert reports[0].intake_source_id == source_id
        assert reports[0].triage_status.value == "awaiting_review"
        assert reports[0].raw_answers_json["person_name"] == "Resident A"
        assert reports[0].raw_answers_json["unknown_columns"]["Unexpected Extra Column"] == "preserved"
        assert reports[1].submitted_at is None
        assert db.query(Case).count() == 0


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


def _sheet_row() -> list[str]:
    return [
        "07/13/2026 12:27:00",
        "A new report about a person",
        "",
        "",
        "Resident A",
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
    ]


def _malformed_timestamp_row() -> list[str]:
    row = _sheet_row()
    row[0] = "not a timestamp"
    row[4] = "Resident B"
    row[30] = "+1 555 9999"
    row[32] = "extra"
    return row
