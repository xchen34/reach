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


def test_public_board_lists_case_tasks_without_private_contact() -> None:
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
    assign_response = client.post(f"/staff/cases/{first_case['id']}/assign", headers=headers)
    assert assign_response.status_code == 200
    safe_response = client.post(
        f"/staff/cases/{second_case['id']}/mark-safe",
        headers=headers,
        json={"note": "Family reached the person directly."},
    )
    assert safe_response.status_code == 200

    board_response = client.get("/board")
    assert board_response.status_code == 200
    payload = board_response.json()

    assert payload["source_mode"] == "case_tasks"
    assert payload["summary"] == {
        "total_records": 2,
        "unassigned": 0,
        "in_progress": 1,
        "found_alive": 1,
        "confirmed_deceased": 0,
    }

    records = payload["records"]
    assert len(records) == 2
    statuses = {record["operational_status"] for record in records}

    assert statuses == {"in_progress", "found_alive"}
    assert all(record["case_code"] for record in records)

    for private_field in (
        "location_summary",
        "needs_summary",
        "urgency",
        "incident_type",
        "language_code",
        "reporter_name",
        "reporter_email",
        "reporter_phone",
        "id",
    ):
        assert private_field not in records[0]
    assert "platform_last_updated_at" in records[0]


def test_public_board_uses_careful_death_confirmation_status() -> None:
    case_payload = _submit_case(
        urgency="low",
        incident_type="other",
        location="West parking lot",
        needs="Duplicate report already resolved.",
    )
    headers = _authenticate_staff("board-archive@example.com")
    with next(override_get_db()) as db:
        from app.models.enums import StaffRole
        from app.models.user import User

        user = db.query(User).filter(User.email == "board-archive@example.com").one()
        user.role = StaffRole.COORDINATOR
        db.commit()
    headers = _authenticate_staff("board-archive@example.com")

    death_response = client.post(
        f"/staff/cases/{case_payload['id']}/mark-deceased",
        headers=headers,
        json={"confirmation_source": "Hospital coordinator confirmed."},
    )
    assert death_response.status_code == 200

    board_response = client.get("/board")
    assert board_response.status_code == 200
    payload = board_response.json()
    assert payload["summary"]["confirmed_deceased"] == 1
    assert payload["records"][0]["operational_status"] == "confirmed_deceased"
    assert payload["records"][0]["latest_public_update"] == "Reach has received confirmed information that the person has died."
