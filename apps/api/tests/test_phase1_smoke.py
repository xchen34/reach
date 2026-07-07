from __future__ import annotations

import os

import httpx
import pytest


def _smoke_base_url() -> str:
    return os.environ.get("BEACON_SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _smoke_client() -> httpx.Client:
    if os.environ.get("BEACON_SMOKE") != "1":
        pytest.skip("Set BEACON_SMOKE=1 to run Docker smoke tests.")

    base_url = _smoke_base_url()
    client = httpx.Client(base_url=base_url, timeout=30.0, follow_redirects=True)
    try:
        health = client.get("/health")
    except httpx.HTTPError as exc:  # pragma: no cover
        client.close()
        pytest.skip(f"Docker smoke target is unavailable at {base_url}: {exc}")

    if health.status_code != 200:
        client.close()
        pytest.skip(f"Docker smoke target is unhealthy at {base_url}: {health.status_code}")

    return client


def test_phase1_docker_smoke_flow() -> None:
    client = _smoke_client()
    try:
        case_response = client.post(
            "/cases",
            json={
                "incident_type": "medical",
                "urgency": "high",
                "location_summary": "Shelter entrance near the east gate",
                "needs_summary": "One adult needs immediate medical attention.",
                "reporter_email": "reporter@example.com",
            },
        )
        assert case_response.status_code == 201
        case_payload = case_response.json()
        case_id = case_payload["id"]
        share_token = case_payload["share_link"]["token"]

        share_response = client.get(f"/share/{share_token}")
        assert share_response.status_code == 200
        share_payload = share_response.json()
        assert share_payload["case_code"] == case_payload["case_code"]
        assert share_payload["status"] == "pending_review"

        magic_link_request = client.post(
            "/auth/request-magic-link",
            json={"email": "qa-smoke-volunteer@example.com"},
        )
        assert magic_link_request.status_code == 200
        login_url = magic_link_request.json()["login_url"]
        assert login_url is not None

        signed_token = login_url.split("token=", maxsplit=1)[1]
        verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
        assert verify_response.status_code == 200
        verify_payload = verify_response.json()
        assert verify_payload["token_type"] == "bearer"
        assert verify_payload["magic_link_status"] == "accepted"

        headers = {"Authorization": f"Bearer {verify_payload['access_token']}"}
        me_response = client.get("/staff/me", headers=headers)
        assert me_response.status_code == 200
        assert me_response.json()["user"]["email"] == "qa-smoke-volunteer@example.com"

        list_response = client.get("/staff/cases", headers=headers)
        assert list_response.status_code == 200
        assert any(item["id"] == case_id for item in list_response.json())

        detail_response = client.get(f"/staff/cases/{case_id}", headers=headers)
        assert detail_response.status_code == 200
        detail_payload = detail_response.json()
        assert detail_payload["reporter_email"] == "reporter@example.com"

        action_response = client.post(
            f"/staff/cases/{case_id}/actions",
            headers=headers,
            json={"action_type": "status_change", "to_status": "active"},
        )
        assert action_response.status_code == 200
        action_payload = action_response.json()
        assert action_payload["action_type"] == "status_change"
        assert action_payload["to_status"] == "active"

        logout_response = client.post("/auth/logout", headers=headers)
        assert logout_response.status_code == 204

        blocked_response = client.get("/staff/me", headers=headers)
        assert blocked_response.status_code == 401
    finally:
        client.close()
