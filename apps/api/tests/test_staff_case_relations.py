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


def _authenticate_staff(email: str = "relations@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    login_url = magic_link_response.json()["login_url"]
    signed_token = login_url.split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _submit_case(location_summary: str, needs_summary: str) -> dict:
    response = client.post(
        "/cases",
        json={
            "incident_type": "other",
            "urgency": "medium",
            "location_summary": location_summary,
            "needs_summary": needs_summary,
            "reporter_name": "Community volunteer",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_staff_can_mark_related_case_and_audit_keeps_metadata() -> None:
    primary_case = _submit_case("Shelter desk", "Need to compare updates about one resident.")
    related_case = _submit_case("Tower 3 gate", "Second report may refer to the same resident.")
    headers = _authenticate_staff()

    relation_response = client.post(
        f"/staff/cases/{primary_case['id']}/relations",
        headers=headers,
        json={
          "related_case_id": related_case["id"],
          "relation_type": "related_update",
          "note": "Likely the same person with a later location update.",
        },
    )
    assert relation_response.status_code == 200
    payload = relation_response.json()
    assert payload["case_id"] == primary_case["id"]
    assert payload["related_case_id"] == related_case["id"]
    assert payload["relation_type"] == "related_update"

    audit_response = client.get(f"/staff/cases/{primary_case['id']}/audit", headers=headers)
    assert audit_response.status_code == 200
    relation_entries = [
        entry
        for entry in audit_response.json()
        if entry.get("metadata_json", {}).get("action_type") == "relation_marked"
    ]
    assert len(relation_entries) == 1
    assert relation_entries[0]["metadata_json"]["related_case_id"] == related_case["id"]
    assert relation_entries[0]["metadata_json"]["relation_type"] == "related_update"
