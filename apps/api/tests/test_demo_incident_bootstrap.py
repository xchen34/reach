from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db import Base
from app.deps import get_db
from app.main import app
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource
from app.models.enums import IncidentStatus
from app.services.dev_bootstrap import (
    DEMO_GOOGLE_FORM_URL,
    DEMO_GOOGLE_SPREADSHEET_ID,
    DEMO_INCIDENT_SLUG,
    bootstrap_demo_incident,
)
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_bootstrap_demo_incident_is_idempotent_and_updates_sheet_name() -> None:
    with next(override_get_db()) as db:
        first = bootstrap_demo_incident(db, google_sheet_name="Form Responses 1")
        second = bootstrap_demo_incident(db, google_sheet_name="Responses")

        assert first.incident_created is True
        assert first.intake_source_created is True
        assert second.incident_created is False
        assert second.intake_source_created is False
        assert second.incident_id == first.incident_id
        assert second.intake_source_id == first.intake_source_id

        incidents = db.query(Incident).all()
        sources = db.query(IncidentIntakeSource).all()
        assert len(incidents) == 1
        assert len(sources) == 1
        assert incidents[0].slug == DEMO_INCIDENT_SLUG
        assert incidents[0].status is IncidentStatus.ACTIVE
        assert sources[0].google_form_url == DEMO_GOOGLE_FORM_URL
        assert sources[0].google_spreadsheet_id == DEMO_GOOGLE_SPREADSHEET_ID
        assert sources[0].google_sheet_name == "Responses"
        assert sources[0].is_active is True


def test_public_and_staff_incident_endpoints_include_bootstrapped_config() -> None:
    with next(override_get_db()) as db:
        result = bootstrap_demo_incident(db, google_sheet_name="Form Responses 1")

    public_response = client.get("/incidents/reach-demo/report")

    assert public_response.status_code == 200
    public_payload = public_response.json()
    assert public_payload["slug"] == "reach-demo"
    assert public_payload["google_form_url"] == DEMO_GOOGLE_FORM_URL
    assert "google_spreadsheet_id" not in public_payload

    headers = _authenticate_staff()
    staff_response = client.get("/staff/incidents", headers=headers)

    assert staff_response.status_code == 200
    staff_payload = staff_response.json()
    incident = next(item for item in staff_payload if item["id"] == result.incident_id)
    assert incident["slug"] == "reach-demo"
    assert incident["intake_sources"][0]["id"] == result.intake_source_id
    assert incident["intake_sources"][0]["google_sheet_name"] == "Form Responses 1"
    assert "google_spreadsheet_id" not in incident["intake_sources"][0]


def _authenticate_staff(email: str = "bootstrap@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}
