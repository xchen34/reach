from __future__ import annotations

from pathlib import Path

import yaml

from app.main import app


PHASE1_PATHS = {
    "/auth/request-magic-link": {"post"},
    "/auth/verify-magic-link": {"post"},
    "/auth/logout": {"post"},
    "/staff/me": {"get"},
    "/cases": {"post"},
    "/voice-intakes": {"post"},
    "/voice-intakes/retrieve": {"post"},
    "/voice-intakes/confirm": {"post"},
    "/staff/cases": {"get"},
    "/staff/cases/{case_id}": {"get"},
    "/staff/cases/{case_id}/voice": {"get"},
    "/staff/cases/{case_id}/voice/audio": {"get"},
    "/staff/cases/{case_id}/actions": {"post"},
    "/staff/cases/{case_id}/audit": {"get"},
    "/share/{token}": {"get"},
}


def _load_documented_openapi() -> dict:
    contract_path = Path(__file__).resolve().parents[3] / "docs" / "openapi.yaml"
    return yaml.safe_load(contract_path.read_text())


def _schema_ref_name(operation: dict, status_code: str) -> str:
    ref = operation["responses"][status_code]["content"]["application/json"]["schema"]["$ref"]
    return ref.rsplit("/", maxsplit=1)[-1]


def test_documented_and_live_openapi_cover_same_phase1_paths() -> None:
    documented = _load_documented_openapi()
    live = app.openapi()

    assert set(PHASE1_PATHS) <= set(documented["paths"])
    assert set(PHASE1_PATHS) <= set(live["paths"])

    for path, methods in PHASE1_PATHS.items():
        assert methods <= set(documented["paths"][path])
        assert methods <= set(live["paths"][path])


def test_documented_and_live_openapi_align_on_phase1_auth_contract() -> None:
    documented = _load_documented_openapi()
    live = app.openapi()

    assert documented["info"]["description"] == live["info"]["description"] == "Phase 1.5 voice intake foundation for Beacon"
    assert list(documented["components"]["securitySchemes"]) == ["bearerAuth"]
    assert list(live["components"]["securitySchemes"]) == ["bearerAuth"]

    documented_verify = _schema_ref_name(documented["paths"]["/auth/verify-magic-link"]["post"], "200")
    live_verify = _schema_ref_name(live["paths"]["/auth/verify-magic-link"]["post"], "200")
    assert documented_verify == live_verify == "MagicLinkVerifyResponse"

    documented_required = documented["components"]["schemas"]["AnonymousCaseSubmissionRequest"]["required"]
    live_required = live["components"]["schemas"]["AnonymousCaseSubmissionRequest"]["required"]
    assert documented_required == live_required == [
        "incident_type",
        "urgency",
        "location_summary",
        "needs_summary",
    ]


def test_documented_and_live_openapi_align_on_logout_and_share_link_metadata() -> None:
    documented = _load_documented_openapi()
    live = app.openapi()

    documented_logout = documented["paths"]["/auth/logout"]["post"]
    live_logout = live["paths"]["/auth/logout"]["post"]
    assert documented_logout["security"] == live_logout["security"] == [{"bearerAuth": []}]
    assert set(documented_logout["responses"]) == {"204", "401"}
    assert set(live_logout["responses"]) == {"204", "401"}

    documented_share = documented["paths"]["/share/{token}"]["get"]
    live_share = live["paths"]["/share/{token}"]["get"]
    assert "capability URL token" in documented_share["description"]
    assert live_share["description"] == documented_share["description"]
    assert live_share["parameters"][0]["description"] == documented_share["parameters"][0]["description"]


def test_case_detail_reporter_email_format_matches_docs_and_live_schema() -> None:
    documented = _load_documented_openapi()
    live = app.openapi()

    documented_email = documented["components"]["schemas"]["CaseDetailResponse"]["properties"]["reporter_email"]
    live_email = live["components"]["schemas"]["CaseDetailResponse"]["properties"]["reporter_email"]

    assert documented_email["anyOf"][0]["format"] == "email"
    assert live_email["anyOf"][0]["format"] == "email"


def test_documented_and_live_openapi_align_on_voice_contract() -> None:
    documented = _load_documented_openapi()
    live = app.openapi()

    documented_upload = documented["paths"]["/voice-intakes"]["post"]
    live_upload = live["paths"]["/voice-intakes"]["post"]
    assert "multipart/form-data" in documented_upload["requestBody"]["content"]
    assert "multipart/form-data" in live_upload["requestBody"]["content"]

    documented_confirm = _schema_ref_name(documented["paths"]["/voice-intakes/confirm"]["post"], "200")
    live_confirm = _schema_ref_name(live["paths"]["/voice-intakes/confirm"]["post"], "200")
    assert documented_confirm == live_confirm == "VoiceIntakeView"

    documented_audio = documented["paths"]["/staff/cases/{case_id}/voice/audio"]["get"]
    live_audio = live["paths"]["/staff/cases/{case_id}/voice/audio"]["get"]
    assert documented_audio["security"] == live_audio["security"] == [{"bearerAuth": []}]
