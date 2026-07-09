from __future__ import annotations

import pytest

from app.config import get_settings
from app.services.case_intake_suggestions import (
    CaseIntakeSuggestionConfigurationError,
    CaseIntakeSuggestionResult,
    DevelopmentStubCaseIntakeSuggestionProvider,
    OpenAICompatibleCaseIntakeSuggestionProvider,
    generate_case_intake_suggestions,
    get_case_intake_suggestion_provider,
)


@pytest.fixture(autouse=True)
def reset_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_get_case_intake_suggestion_provider_defaults_to_stub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("BEACON_CASE_INTAKE_SUGGESTIONS_PROVIDER", raising=False)

    provider = get_case_intake_suggestion_provider()

    assert isinstance(provider, DevelopmentStubCaseIntakeSuggestionProvider)


def test_get_case_intake_suggestion_provider_returns_openai_compatible_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_PROVIDER", "openai_compatible")
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_MODEL", "demo-model")
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_BASE_URL", "https://llm.example/v1/")
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_TIMEOUT_SECONDS", "8.5")

    provider = get_case_intake_suggestion_provider()

    assert isinstance(provider, OpenAICompatibleCaseIntakeSuggestionProvider)
    assert provider.base_url == "https://llm.example/v1"
    assert provider.model == "demo-model"
    assert provider.timeout_seconds == 8.5


def test_get_case_intake_suggestion_provider_rejects_missing_openai_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_PROVIDER", "openai_compatible")
    monkeypatch.delenv("BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_API_KEY", raising=False)

    with pytest.raises(CaseIntakeSuggestionConfigurationError) as exc_info:
        get_case_intake_suggestion_provider()

    assert "BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_API_KEY" in str(exc_info.value)


def test_get_case_intake_suggestion_provider_rejects_unsupported_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_CASE_INTAKE_SUGGESTIONS_PROVIDER", "unknown_provider")

    with pytest.raises(CaseIntakeSuggestionConfigurationError) as exc_info:
        get_case_intake_suggestion_provider()

    assert "Unsupported case_intake_suggestions_provider" in str(exc_info.value)


def test_generate_case_intake_suggestions_returns_stable_stub_shape() -> None:
    result = generate_case_intake_suggestions(
        content=(
            "My sister has been missing since last night. We have not seen her and "
            "she may need medical help. Please help us find shelter and transportation."
        )
    )

    assert isinstance(result, CaseIntakeSuggestionResult)
    assert result.suggestion_only is True
    assert result.staff_summary_suggestion.headline.startswith("Suggestion only")
    assert "Stub summary from intake text:" in result.staff_summary_suggestion.situation_overview
    assert result.staff_summary_suggestion.recommended_follow_up
    assert "medical_emergency" in result.suggested_tags.urgency_cues
    assert "possible_missing_person" in result.suggested_tags.missing_person_mentions
    assert "medical" in result.suggested_tags.incident_or_resource_types
    assert "shelter" in result.suggested_tags.incident_or_resource_types
    assert "transportation" in result.suggested_tags.incident_or_resource_types
    assert "location_confirmation_needed" in result.suggested_tags.follow_up_needs
