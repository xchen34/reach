from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
from app.models.case import Case
from app.models.report import Report
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # Override a repository-level .env so this test module remains deterministic.
    monkeypatch.setenv("BEACON_GOOGLE_FORM_INGEST_TOKEN", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _payload(report_kind: str = "missing") -> dict:
    return {
        "report_kind": report_kind,
        "location_summary": "Tower 2 lobby near the lifts",
        "details_summary": "Family cannot reach one resident and asks volunteers to verify their status.",
        "language_code": "en",
        "reporter_name": "Community Lead",
        "reporter_email": "lead@example.com",
        "subject_name": "Resident A",
        "source_relationship": "family_friend",
        "callback_allowed": True,
        "public_visibility_requested": True,
        "source_form_id": "form-missing-person",
        "source_form_name": "Missing Person Form",
        "source_entry_id": "entry-123",
    }


def test_google_form_ingest_requires_valid_shared_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEACON_GOOGLE_FORM_INGEST_TOKEN", "secret-ingest-token")
    get_settings.cache_clear()

    response = client.post("/ingest/google-form", json=_payload())

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid ingest token."}


def test_google_form_ingest_rejects_when_not_configured() -> None:
    response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json=_payload(),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Google Form ingest is not configured."}


def test_google_form_ingest_creates_report_without_case_or_publication(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEACON_GOOGLE_FORM_INGEST_TOKEN", "secret-ingest-token")
    get_settings.cache_clear()

    ingest_response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json=_payload(),
    )

    assert ingest_response.status_code == 200
    ingest_payload = ingest_response.json()
    assert ingest_payload["source"] == "google_form"
    assert ingest_payload["report_code"].startswith("RPT-")
    assert ingest_payload["triage_status"] == "awaiting_review"

    with next(override_get_db()) as db:
        assert db.query(Report).count() == 1
        assert db.query(Case).count() == 0

    board_response = client.get("/board")
    assert board_response.status_code == 200
    board_payload = board_response.json()
    assert board_payload["summary"]["total_records"] == 0
    assert board_payload["records"] == []


def test_google_form_ingest_is_idempotent_by_source_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEACON_GOOGLE_FORM_INGEST_TOKEN", "secret-ingest-token")
    get_settings.cache_clear()

    first_response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json=_payload(),
    )
    second_response = client.post(
        "/ingest/google-form",
        headers={"x-beacon-ingest-token": "secret-ingest-token"},
        json={**_payload(), "details_summary": "A later duplicate delivery should not overwrite source."},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["id"] == first_response.json()["id"]
    assert second_response.json()["report_code"] == first_response.json()["report_code"]

    with next(override_get_db()) as db:
        reports = db.query(Report).all()
        assert len(reports) == 1
        assert reports[0].original_narrative == _payload()["details_summary"]
