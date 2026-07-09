from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.services.case_intake_review as case_intake_review_service
from app.config import get_settings
from app.db import Base
from app.deps import get_db
from app.main import app
from test_app import engine, override_get_db


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setenv("BEACON_VOICE_STORAGE_DIR", str(tmp_path / "voice"))
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_PROVIDER", "development_stub")
    monkeypatch.setenv("BEACON_VOICE_MAX_UPLOAD_BYTES", "128")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _authenticate_staff(email: str = "voice-staff@example.com") -> dict[str, str]:
    magic_link_response = client.post("/auth/request-magic-link", json={"email": email})
    assert magic_link_response.status_code == 200
    signed_token = magic_link_response.json()["login_url"].split("token=", maxsplit=1)[1]
    verify_response = client.post("/auth/verify-magic-link", json={"token": signed_token})
    assert verify_response.status_code == 200
    return {"Authorization": f"Bearer {verify_response.json()['access_token']}"}


def _upload_voice(*, content: bytes = b"RIFFvoice", content_type: str = "audio/wav") -> dict:
    response = client.post(
        "/voice-intakes",
        files={"audio_file": ("voice.wav", content, content_type)},
        data={"language_code": "en", "duration_seconds": "2.5"},
    )
    assert response.status_code == 201
    return response.json()


def test_voice_upload_rejects_invalid_content_type() -> None:
    response = client.post(
        "/voice-intakes",
        files={"audio_file": ("voice.txt", b"not-audio", "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported audio format."


def test_voice_upload_accepts_octet_stream_when_file_extension_is_supported() -> None:
    response = client.post(
        "/voice-intakes",
        files={"audio_file": ("voice.webm", b"webm-audio", "application/octet-stream")},
        data={"language_code": "en"},
    )

    assert response.status_code == 201
    assert response.json()["content_type"] == "audio/webm"


def test_voice_upload_accepts_supported_content_type_with_codecs_parameter() -> None:
    response = client.post(
        "/voice-intakes",
        files={"audio_file": ("voice.webm", b"webm-audio", "audio/webm;codecs=opus")},
        data={"language_code": "en"},
    )

    assert response.status_code == 201
    assert response.json()["content_type"] == "audio/webm"


def test_voice_upload_rejects_files_over_size_limit() -> None:
    response = client.post(
        "/voice-intakes",
        files={"audio_file": ("voice.wav", b"x" * 129, "audio/wav")},
    )
    assert response.status_code == 413
    assert response.json()["detail"] == "Audio file exceeds the size limit."


def test_voice_upload_confirm_attach_and_staff_access_flow() -> None:
    upload_payload = _upload_voice()
    assert upload_payload["processing_status"] == "completed"
    assert upload_payload["transcript_state"] == "generated"
    assert upload_payload["attached_to_case"] is False

    retrieve_response = client.post(
        "/voice-intakes/retrieve",
        json={"voice_intake_token": upload_payload["voice_intake_token"]},
    )
    assert retrieve_response.status_code == 200
    assert retrieve_response.json()["transcription_text"]

    confirm_response = client.post(
        "/voice-intakes/confirm",
        json={
            "voice_intake_token": upload_payload["voice_intake_token"],
            "confirmed_transcript_text": "There is smoke in the hallway and we need evacuation help.",
        },
    )
    assert confirm_response.status_code == 200
    confirm_payload = confirm_response.json()
    assert confirm_payload["transcript_state"] == "edited"
    assert confirm_payload["confirmed_transcript_text"].startswith("There is smoke")

    case_response = client.post(
        "/cases",
        json={
            "incident_type": "fire",
            "urgency": "high",
            "language_code": "en",
            "location_summary": "42 River Street, Lyon apartment 5B",
            "needs_summary": "There is smoke in the hallway and we need evacuation help.",
            "voice_intake_token": upload_payload["voice_intake_token"],
        },
    )
    assert case_response.status_code == 201
    case_payload = case_response.json()

    attached_retrieve = client.post(
        "/voice-intakes/retrieve",
        json={"voice_intake_token": upload_payload["voice_intake_token"]},
    )
    assert attached_retrieve.status_code == 404

    duplicate_attach = client.post(
        "/cases",
        json={
            "incident_type": "fire",
            "urgency": "high",
            "language_code": "en",
            "location_summary": "42 River Street, Lyon apartment 5B",
            "needs_summary": "Duplicate attempt.",
            "voice_intake_token": upload_payload["voice_intake_token"],
        },
    )
    assert duplicate_attach.status_code == 400
    assert duplicate_attach.json()["detail"] == "Voice intake is unavailable."

    headers = _authenticate_staff()

    voice_response = client.get(f"/staff/cases/{case_payload['id']}/voice", headers=headers)
    assert voice_response.status_code == 200
    voice_payload = voice_response.json()
    assert voice_payload["audio_available"] is True
    assert voice_payload["confirmed_transcript_text"].startswith("There is smoke")

    review_response = client.get(f"/staff/cases/{case_payload['id']}/intake-review", headers=headers)
    assert review_response.status_code == 200
    review_payload = review_response.json()
    assert review_payload["status"] == "ready"
    assert review_payload["suggestion_only"] is True
    assert review_payload["staff_summary_suggestion"]["headline"].startswith("Suggestion only")
    assert "confirmed voice transcript" in review_payload["source_inputs"]
    assert "fire" in review_payload["suggested_tags"]["incident_or_resource_types"]

    audio_response = client.get(f"/staff/cases/{case_payload['id']}/voice/audio", headers=headers)
    assert audio_response.status_code == 200
    assert audio_response.headers["content-type"].startswith("audio/wav")
    assert audio_response.content == b"RIFFvoice"

    audit_response = client.get(f"/staff/cases/{case_payload['id']}/audit", headers=headers)
    assert audit_response.status_code == 200
    event_types = [entry["event_type"] for entry in audit_response.json()]
    assert "voice_transcript_attached" in event_types
    assert "staff_voice_audio_accessed" in event_types


def test_voice_upload_falls_back_to_stub_when_real_provider_lacks_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_PROVIDER", "openai_compatible")
    monkeypatch.delenv("BEACON_SPEECH_TO_TEXT_OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()

    upload_payload = _upload_voice()

    assert upload_payload["processing_status"] == "completed"
    assert upload_payload["transcription_text"] == (
        "Audio received. Review and edit this transcript before submitting."
    )
    assert upload_payload["transcription_language_code"] == "en"


def test_voice_staff_routes_require_bearer_authentication() -> None:
    upload_payload = _upload_voice()
    client.post(
        "/voice-intakes/confirm",
        json={
            "voice_intake_token": upload_payload["voice_intake_token"],
            "confirmed_transcript_text": "Please send help.",
        },
    )
    case_response = client.post(
        "/cases",
        json={
            "incident_type": "medical",
            "urgency": "high",
            "location_summary": "Apartment stairwell, third floor",
            "needs_summary": "Please send help.",
            "voice_intake_token": upload_payload["voice_intake_token"],
        },
    )
    case_id = case_response.json()["id"]

    metadata_response = client.get(f"/staff/cases/{case_id}/voice")
    assert metadata_response.status_code == 401
    assert metadata_response.json()["detail"] == "Missing bearer token."

    review_response = client.get(f"/staff/cases/{case_id}/intake-review")
    assert review_response.status_code == 401
    assert review_response.json()["detail"] == "Missing bearer token."

    audio_response = client.get(f"/staff/cases/{case_id}/voice/audio")
    assert audio_response.status_code == 401
    assert audio_response.json()["detail"] == "Missing bearer token."


def test_intake_review_degrades_when_provider_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case_response = client.post(
        "/cases",
        json={
            "incident_type": "other",
            "urgency": "medium",
            "location_summary": "Community center lobby",
            "needs_summary": "Need information about overnight shelter and transportation.",
        },
    )
    assert case_response.status_code == 201
    case_id = case_response.json()["id"]
    headers = _authenticate_staff("review-failure@example.com")

    def raise_error(*, content: str) -> None:
        raise RuntimeError(f"boom: {content}")

    monkeypatch.setattr(case_intake_review_service, "generate_case_intake_suggestions", raise_error)

    review_response = client.get(f"/staff/cases/{case_id}/intake-review", headers=headers)
    assert review_response.status_code == 200
    review_payload = review_response.json()
    assert review_payload["status"] == "unavailable"
    assert review_payload["suggestion_only"] is True
    assert review_payload["staff_summary_suggestion"] is None
    assert review_payload["suggested_tags"] is None
    assert review_payload["fallback_message"]
