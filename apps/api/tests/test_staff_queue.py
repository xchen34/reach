from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
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


def _authenticate_staff(email: str = "queue@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _ingest(payload: dict) -> None:
    response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json=payload,
    )
    assert response.status_code == 200


def test_staff_queue_groups_related_reports_by_subject_before_location() -> None:
    shared_subject = "Resident A"
    _ingest(
        {
            "report_kind": "missing",
            "location_summary": "Tower 2 lobby",
            "details_summary": "Family cannot reach the resident.",
            "reporter_name": "Family contact",
            "subject_name": shared_subject,
            "source_relationship": "family_friend",
            "source_form_name": "Missing Person Form",
            "source_entry_id": "entry-1",
        }
    )
    _ingest(
        {
            "report_kind": "update",
            "location_summary": "Shelter desk",
            "details_summary": "Possible sighting reported by community member.",
            "reporter_name": "Volunteer desk",
            "subject_name": shared_subject,
            "source_relationship": "community_member",
            "update_category": "missing_lead",
            "source_form_name": "Update / Lead Form",
            "source_entry_id": "entry-2",
        }
    )

    queue_response = client.get("/staff/cases/queue", headers=_authenticate_staff())
    assert queue_response.status_code == 200
    payload = queue_response.json()
    assert payload["summary"]["total_events"] == 1

    group = payload["events"][0]
    assert group["subject_name"] == shared_subject
    assert group["case_count"] == 2
    assert group["update_chain_count"] == 1
    assert group["title"] == shared_subject
