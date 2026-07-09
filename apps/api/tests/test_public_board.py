from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db import Base
from app.deps import get_db
from app.main import app
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _submit_case(*, urgency: str, incident_type: str, location: str, needs: str) -> dict:
    response = client.post(
        "/cases",
        json={
            "incident_type": incident_type,
            "urgency": urgency,
            "language_code": "en",
            "location_summary": location,
            "needs_summary": needs,
            "reporter_name": "Hidden Reporter",
            "reporter_email": "hidden@example.com",
            "reporter_phone": "+1 555 555 5555",
        },
    )
    assert response.status_code == 201
    return response.json()


def _authenticate_staff(email: str = "board-reviewer@example.com") -> dict[str, str]:
    magic_link_response = client.post(
        "/auth/request-magic-link",
        json={"email": email},
    )
    assert magic_link_response.status_code == 200
    login_url = magic_link_response.json()["login_url"]
    assert login_url is not None

    signed_token = login_url.split("token=", maxsplit=1)[1]
    verify_response = client.post(
        "/auth/verify-magic-link",
        json={"token": signed_token},
    )
    assert verify_response.status_code == 200
    access_token = verify_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


def test_public_board_lists_publicly_safe_fields_and_status_buckets() -> None:
    first_case = _submit_case(
        urgency="high",
        incident_type="medical",
        location="Block A stairwell",
        needs="One adult needs immediate follow-up.",
    )
    second_case = _submit_case(
        urgency="medium",
        incident_type="shelter",
        location="Community hall desk",
        needs="Family reports they reached shelter safely.",
    )
    headers = _authenticate_staff()

    action_response = client.post(
        f"/staff/cases/{second_case['id']}/actions",
        headers=headers,
        json={"action_type": "status_change", "to_status": "safe_resolved"},
    )
    assert action_response.status_code == 200

    board_response = client.get("/board")
    assert board_response.status_code == 200
    payload = board_response.json()

    assert payload["source_mode"] == "derived_from_cases"
    assert payload["summary"] == {
        "total_records": 2,
        "unverified": 1,
        "responding": 0,
        "needs_follow_up": 0,
        "safe_confirmed": 1,
        "archived": 0,
    }

    records = payload["records"]
    assert len(records) == 2
    first_record = next(record for record in records if record["case_code"] == first_case["case_code"])
    second_record = next(record for record in records if record["case_code"] == second_case["case_code"])

    assert first_record["board_status"] == "unverified"
    assert second_record["board_status"] == "safe_confirmed"
    assert second_record["latest_public_update"] == "Case status updated to safe_resolved."

    for record in records:
        assert "reporter_name" not in record
        assert "reporter_email" not in record
        assert "reporter_phone" not in record
        assert "id" not in record


def test_public_board_hides_archived_records_by_default() -> None:
    case_payload = _submit_case(
        urgency="low",
        incident_type="other",
        location="West parking lot",
        needs="Duplicate report already resolved.",
    )
    headers = _authenticate_staff("board-archive@example.com")

    action_response = client.post(
        f"/staff/cases/{case_payload['id']}/actions",
        headers=headers,
        json={"action_type": "status_change", "to_status": "closed"},
    )
    assert action_response.status_code == 200

    board_response = client.get("/board")
    assert board_response.status_code == 200
    payload = board_response.json()
    assert payload["summary"]["total_records"] == 0
    assert payload["records"] == []

    archived_response = client.get("/board?include_archived=true")
    assert archived_response.status_code == 200
    archived_payload = archived_response.json()
    assert archived_payload["summary"]["archived"] == 1
    assert archived_payload["records"][0]["board_status"] == "archived"
