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


def _authenticate_staff(email: str = "publisher@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    login_url = magic_link_response.json()["login_url"]
    signed_token = login_url.split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _submit_case() -> dict:
    response = client.post(
        "/cases",
        json={
            "incident_type": "medical",
            "urgency": "high",
            "location_summary": "Block C stair landing",
            "needs_summary": "Resident asks for welfare check and medication support.",
            "reporter_email": "reporter@example.com",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_publish_workflow_updates_public_board_fields() -> None:
    case_payload = _submit_case()
    headers = _authenticate_staff()

    publish_response = client.post(
        f"/staff/cases/{case_payload['id']}/publish",
        headers=headers,
        json={
            "to_status": "waiting_for_information",
            "latest_public_update": "Volunteers are checking with building contacts and waiting for a callback.",
        },
    )
    assert publish_response.status_code == 200
    publish_payload = publish_response.json()
    assert publish_payload["status"] == "waiting_for_information"
    assert (
        publish_payload["latest_public_update"]
        == "Volunteers are checking with building contacts and waiting for a callback."
    )

    detail_response = client.get(f"/staff/cases/{case_payload['id']}", headers=headers)
    assert detail_response.status_code == 200
    assert (
        detail_response.json()["latest_public_update"]
        == "Volunteers are checking with building contacts and waiting for a callback."
    )

    board_response = client.get("/board")
    assert board_response.status_code == 200
    record = board_response.json()["records"][0]
    assert record["operational_status"] == "in_progress"
    assert (
        record["latest_public_update"]
        == "Volunteers are checking with building contacts and waiting for a callback."
    )
    assert "platform_last_updated_at" in record
