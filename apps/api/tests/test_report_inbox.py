from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
from app.models.case import Case
from app.models.case_report import CaseReport
from app.models.enums import CaseStatus
from app.models.report import Report
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setenv("BEACON_GOOGLE_FORM_INGEST_TOKEN", "secret-ingest-token")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _authenticate_staff(email: str = "reports@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _ingest(entry_id: str = "entry-report-1") -> int:
    response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json={
            "report_kind": "missing",
            "location_summary": "Tower 2 lobby near the lifts",
            "details_summary": "Synthetic reporter cannot reach one resident after evacuation.",
            "language_code": "en",
            "reporter_name": "Synthetic Reporter",
            "reporter_email": "synthetic-reporter@example.com",
            "reporter_phone": "+1 555 0100",
            "subject_name": "Resident A",
            "source_relationship": "family_friend",
            "is_first_hand": False,
            "callback_allowed": True,
            "source_form_id": "google-form-id-123",
            "source_form_name": "Missing Person Form",
            "source_entry_id": entry_id,
        },
    )
    assert response.status_code == 200
    return response.json()["id"]


def test_report_detail_requires_staff_and_exposes_source_fields_only_on_detail() -> None:
    report_id = _ingest()

    list_response = client.get("/staff/reports", headers=_authenticate_staff())
    assert list_response.status_code == 200
    list_item = list_response.json()["reports"][0]
    assert list_item["id"] == report_id
    assert "reporter_email" not in list_item
    assert "reporter_phone" not in list_item
    assert "raw_answers_json" not in list_item

    blocked_response = client.get(f"/staff/reports/{report_id}")
    assert blocked_response.status_code == 401

    detail_response = client.get(f"/staff/reports/{report_id}", headers=_authenticate_staff())
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["reporter_email"] == "synthetic-reporter@example.com"
    assert detail["raw_answers_json"]["source_form_id"] == "google-form-id-123"


def test_create_case_from_report_links_report_and_uses_compatibility_statuses() -> None:
    report_id = _ingest()
    headers = _authenticate_staff()

    response = client.post(
        f"/staff/reports/{report_id}/create-case",
        headers=headers,
        json={
            "urgency": "high",
            "incident_type": "other",
            "location_summary": "Tower 2 lobby near the lifts",
            "needs_summary": "Synthetic resident may still be unreachable.",
            "person_label": "Resident A",
            "safety_status": "unknown",
            "handling_status": "being_investigated",
            "verification_task": "confirm_identity",
            "note": "Created from reviewed report.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["report"]["triage_status"] == "linked_to_case"
    assert payload["case"]["status"] == "active"
    assert payload["case"]["safety_status"] == "unknown"
    assert payload["case"]["handling_status"] == "being_investigated"

    with next(override_get_db()) as db:
        assert db.query(CaseReport).count() == 1
        case = db.query(Case).one()
        assert case.status is CaseStatus.ACTIVE


def test_report_can_link_to_only_one_case_and_source_is_immutable() -> None:
    report_id = _ingest()
    headers = _authenticate_staff()

    first = client.post(
        f"/staff/reports/{report_id}/create-case",
        headers=headers,
        json={
            "urgency": "high",
            "incident_type": "other",
            "location_summary": "Tower 2 lobby near the lifts",
            "needs_summary": "Synthetic resident may still be unreachable.",
            "person_label": "Resident A",
        },
    )
    assert first.status_code == 200

    note_response = client.post(
        f"/staff/reports/{report_id}/notes",
        headers=headers,
        json={"note": "Staff interpretation only; source content remains unchanged."},
    )
    assert note_response.status_code == 200
    detail = note_response.json()["report"]
    assert detail["original_narrative"] == "Synthetic reporter cannot reach one resident after evacuation."
    assert detail["raw_answers_json"]["details_summary"] == detail["original_narrative"]
    assert detail["reporter_email"] == "synthetic-reporter@example.com"

    with next(override_get_db()) as db:
        existing_case = db.query(Case).one()
        second_case = Case(
            case_code="SECONDCASE",
            status=CaseStatus.PENDING_REVIEW,
            urgency=existing_case.urgency,
            incident_type=existing_case.incident_type,
            language_code="en",
            location_summary="Another location",
            needs_summary="Another possible person.",
        )
        db.add(second_case)
        db.commit()
        second_case_id = second_case.id

    link_again = client.post(
        f"/staff/reports/{report_id}/link-case",
        headers=headers,
        json={"case_id": second_case_id, "link_reason": "Should fail."},
    )
    assert link_again.status_code == 409

    with next(override_get_db()) as db:
        assert db.query(CaseReport).filter(CaseReport.report_id == report_id).count() == 1


def test_unlinked_report_can_be_marked_out_of_scope_without_mutating_source() -> None:
    report_id = _ingest("entry-out-of-scope")
    headers = _authenticate_staff()

    response = client.post(
        f"/staff/reports/{report_id}/out-of-scope",
        headers=headers,
        json={"note": "This is not about urgent person safety."},
    )

    assert response.status_code == 200
    report = response.json()["report"]
    assert report["triage_status"] == "out_of_scope"
    assert report["original_narrative"] == "Synthetic reporter cannot reach one resident after evacuation."

    with next(override_get_db()) as db:
        stored = db.get(Report, report_id)
        assert stored is not None
        assert stored.original_narrative == "Synthetic reporter cannot reach one resident after evacuation."
        assert stored.reporter_phone == "+1 555 0100"
