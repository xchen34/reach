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


def test_staff_can_confirm_duplicate_and_close_the_duplicate_record() -> None:
    primary_case = _submit_case("Shelter desk", "Need to compare updates about one resident.")
    related_case = _submit_case("Tower 3 gate", "Second report may refer to the same resident.")
    headers = _authenticate_staff()

    relation_response = client.post(
        f"/staff/cases/{primary_case['id']}/relations",
        headers=headers,
        json={
          "related_case_id": related_case["id"],
          "relation_type": "confirmed_duplicate",
          "note": "Same person with a later location update.",
        },
    )
    assert relation_response.status_code == 200
    payload = relation_response.json()
    assert payload["case_id"] == primary_case["id"]
    assert payload["related_case_id"] == related_case["id"]
    assert payload["relation_type"] == "confirmed_duplicate"

    case_response = client.get(f"/staff/cases/{primary_case['id']}", headers=headers)
    assert case_response.status_code == 200
    assert case_response.json()["status"] == "closed"

    audit_response = client.get(f"/staff/cases/{primary_case['id']}/audit", headers=headers)
    assert audit_response.status_code == 200
    relation_entries = [
        entry
        for entry in audit_response.json()
        if entry.get("metadata_json", {}).get("action_type") == "relation_marked"
    ]
    assert len(relation_entries) == 1
    assert relation_entries[0]["metadata_json"]["related_case_id"] == related_case["id"]
    assert relation_entries[0]["metadata_json"]["relation_type"] == "confirmed_duplicate"
    assert relation_entries[0]["metadata_json"]["closed_as_duplicate"] is True


def test_staff_can_merge_duplicate_cases_and_audit_both_records() -> None:
    primary_case = _submit_case("Shelter desk", "Need to follow up with David Bowie.")
    duplicate_case = _submit_case("Temporary shelter near pharmacy", "David Bowie was seen near the pharmacy.")
    headers = _authenticate_staff()

    merge_response = client.post(
        f"/staff/cases/{primary_case['id']}/merge-duplicates",
        headers=headers,
        json={
            "duplicate_case_ids": [duplicate_case["id"]],
            "note": "Same name and same shelter report; keep the shelter desk case primary.",
        },
    )
    assert merge_response.status_code == 200
    merge_payload = merge_response.json()
    assert merge_payload["primary_case_id"] == primary_case["id"]
    assert merge_payload["merged_case_ids"] == [duplicate_case["id"]]

    duplicate_detail_response = client.get(f"/staff/cases/{duplicate_case['id']}", headers=headers)
    assert duplicate_detail_response.status_code == 200
    duplicate_detail = duplicate_detail_response.json()
    assert duplicate_detail["status"] == "closed"
    assert duplicate_detail["merged_into_case_id"] == primary_case["id"]

    primary_audit_response = client.get(f"/staff/cases/{primary_case['id']}/audit", headers=headers)
    assert primary_audit_response.status_code == 200
    primary_merge_entries = [
        entry
        for entry in primary_audit_response.json()
        if entry.get("metadata_json", {}).get("action_type") == "duplicate_merged"
    ]
    assert len(primary_merge_entries) == 1
    assert primary_merge_entries[0]["metadata_json"]["merged_case_ids"] == [duplicate_case["id"]]

    duplicate_audit_response = client.get(f"/staff/cases/{duplicate_case['id']}/audit", headers=headers)
    assert duplicate_audit_response.status_code == 200
    duplicate_merge_entries = [
        entry
        for entry in duplicate_audit_response.json()
        if entry.get("metadata_json", {}).get("action_type") == "duplicate_merged"
    ]
    assert len(duplicate_merge_entries) == 1
    assert duplicate_merge_entries[0]["metadata_json"]["primary_case_id"] == primary_case["id"]


def test_withdrawing_a_case_hides_it_without_claiming_anything() -> None:
    """Hiding a case must not require asserting that someone was found.

    Before withdrawal existed, clearing a mistaken or test case meant merging it
    into a real duplicate or marking the person safe or deceased — which
    publishes a false status to the public board.
    """
    headers = _authenticate_staff()
    case_id = _submit_case("7 rue Test, ground floor", "Created by mistake during setup.")["id"]

    # Visible to begin with, on both surfaces.
    assert any(c["id"] == case_id for c in _queue_cases(headers))

    empty_reason = client.post(
        f"/staff/cases/{case_id}/withdraw", headers=headers, json={"reason": ""}
    )
    assert empty_reason.status_code == 422, "a reason is required"

    withdrawn = client.post(
        f"/staff/cases/{case_id}/withdraw",
        headers=headers,
        json={"reason": "Duplicate test record created during setup."},
    )
    assert withdrawn.status_code == 200

    # Gone from the staff queue and from the public board.
    assert not any(c["id"] == case_id for c in _queue_cases(headers))
    board = client.get("/board")
    assert board.status_code == 200
    assert all(r["case_code"] != withdrawn.json()["case_code"] for r in board.json()["records"])

    # The record itself is kept, with who and why.
    detail = client.get(f"/staff/cases/{case_id}", headers=headers)
    assert detail.status_code == 200

    again = client.post(
        f"/staff/cases/{case_id}/withdraw", headers=headers, json={"reason": "again"}
    )
    assert again.status_code == 400, "withdrawing twice is a mistake worth reporting"

    restored = client.post(f"/staff/cases/{case_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert any(c["id"] == case_id for c in _queue_cases(headers)), "withdrawal is reversible"


def _queue_cases(headers: dict[str, str]) -> list[dict]:
    response = client.get("/staff/cases/queue", headers=headers)
    assert response.status_code == 200
    return [case for event in response.json()["events"] for case in event["related_cases"]]
