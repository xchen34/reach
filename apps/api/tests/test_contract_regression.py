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


def _authenticate_staff(email: str = "coordinator@example.com") -> dict[str, str]:
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


def _submit_case() -> dict:
    response = client.post(
        "/cases",
        json={
            "incident_type": "medical",
            "urgency": "high",
            "location_summary": "Apartment stairwell, third floor",
            "needs_summary": "One adult with chest pain and trouble breathing.",
            "reporter_email": "reporter@example.com",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_staff_routes_require_bearer_authentication() -> None:
    case_payload = _submit_case()

    protected_requests = (
        ("get", "/staff/me", None),
        ("get", "/staff/cases", None),
        ("get", f"/staff/cases/{case_payload['id']}", None),
        ("post", f"/staff/cases/{case_payload['id']}/actions", {"action_type": "note", "note": "hello"}),
        ("get", f"/staff/cases/{case_payload['id']}/audit", None),
        ("post", "/auth/logout", None),
    )

    for method, path, json_body in protected_requests:
        response = client.request(method, path, json=json_body)
        assert response.status_code == 401
        assert response.json()["detail"] == "Missing bearer token."


def test_public_case_submission_and_share_link_flow_matches_contract() -> None:
    case_payload = _submit_case()
    assert case_payload["case_code"]
    assert case_payload["status"] == "pending_review"
    assert case_payload["share_link"]["token"]
    assert case_payload["share_link"]["scope"] == "status_only"
    assert case_payload["share_link"]["url"].endswith(f"/share/{case_payload['share_link']['token']}")

    share_response = client.get(f"/share/{case_payload['share_link']['token']}")
    assert share_response.status_code == 200
    share_payload = share_response.json()
    assert share_payload["case_code"] == case_payload["case_code"]
    assert share_payload["status"] == "pending_review"
    assert share_payload["latest_public_update"] == "Report received. Waiting for staff review."


def test_staff_case_access_and_logout_regression() -> None:
    case_payload = _submit_case()
    headers = _authenticate_staff()

    me_response = client.get("/staff/me", headers=headers)
    assert me_response.status_code == 200

    detail_response = client.get(f"/staff/cases/{case_payload['id']}", headers=headers)
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["reporter_email"] == "reporter@example.com"
    assert detail_payload["language_code"] == "en"

    logout_response = client.post("/auth/logout", headers=headers)
    assert logout_response.status_code == 204

    blocked_response = client.get("/staff/me", headers=headers)
    assert blocked_response.status_code == 401
    assert blocked_response.json()["detail"] == "Session revoked."
