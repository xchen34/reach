from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx

from app.config import get_settings


@dataclass(frozen=True)
class SuggestedCaseIntakeSummary:
    headline: str
    situation_overview: str
    urgency_note: str
    recommended_follow_up: list[str]


@dataclass(frozen=True)
class SuggestedCaseIntakeTags:
    urgency_cues: list[str]
    missing_person_mentions: list[str]
    incident_or_resource_types: list[str]
    follow_up_needs: list[str]


@dataclass(frozen=True)
class CaseIntakeSuggestionResult:
    suggestion_only: bool
    staff_summary_suggestion: SuggestedCaseIntakeSummary
    suggested_tags: SuggestedCaseIntakeTags


class CaseIntakeSuggestionConfigurationError(ValueError):
    pass


class CaseIntakeSuggestionProvider(ABC):
    @abstractmethod
    def generate_suggestions(self, *, content: str) -> CaseIntakeSuggestionResult:
        raise NotImplementedError


class DevelopmentStubCaseIntakeSuggestionProvider(CaseIntakeSuggestionProvider):
    def generate_suggestions(self, *, content: str) -> CaseIntakeSuggestionResult:
        normalized = _normalize_content(content)
        analysis_content = normalized.lower()
        excerpt = _truncate(normalized, limit=240)

        urgency_tags = _detect_urgency_cues(analysis_content)
        missing_person_tags = _detect_missing_person_mentions(analysis_content)
        incident_tags = _detect_incident_or_resource_types(analysis_content)
        follow_up_tags = _detect_follow_up_needs(analysis_content)

        headline_parts = ["Suggestion only"]
        if incident_tags:
            headline_parts.append(f"possible {incident_tags[0].replace('_', ' ')}")
        if urgency_tags:
            headline_parts.append(f"with {urgency_tags[0].replace('_', ' ')} cue")

        urgency_note = (
            "Potential urgent cue detected. Staff should verify immediacy and safety needs directly."
            if any(tag in {"immediate_danger", "medical_emergency", "child_involved"} for tag in urgency_tags)
            else "No clear immediate danger cue detected in the stub analysis. Staff should still verify risk directly."
        )

        recommended_follow_up = _dedupe_preserving_order(
            [
                "Confirm the caller's current location or last known location."
                if "location_confirmation_needed" in follow_up_tags
                else "",
                "Clarify whether anyone is in immediate danger and whether emergency services have been contacted."
                if "immediate_safety_check" in follow_up_tags or urgency_tags
                else "",
                "Ask who is missing, when they were last seen, and what identifying details staff can document."
                if missing_person_tags
                else "",
                "Confirm what practical support or resources the person is requesting."
                if "resource_request_clarification" in follow_up_tags or not incident_tags
                else "",
            ]
        )
        if not recommended_follow_up:
            recommended_follow_up = ["Confirm the main concern, current location, and preferred follow-up path."]

        return CaseIntakeSuggestionResult(
            suggestion_only=True,
            staff_summary_suggestion=SuggestedCaseIntakeSummary(
                headline="; ".join(headline_parts),
                situation_overview=f"Stub summary from intake text: {excerpt}",
                urgency_note=urgency_note,
                recommended_follow_up=recommended_follow_up,
            ),
            suggested_tags=SuggestedCaseIntakeTags(
                urgency_cues=urgency_tags,
                missing_person_mentions=missing_person_tags,
                incident_or_resource_types=incident_tags,
                follow_up_needs=follow_up_tags,
            ),
        )


class OpenAICompatibleCaseIntakeSuggestionProvider(CaseIntakeSuggestionProvider):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        if not api_key.strip():
            raise CaseIntakeSuggestionConfigurationError(
                "case_intake_suggestions_provider 'openai_compatible' requires BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_API_KEY."
            )
        if not model.strip():
            raise CaseIntakeSuggestionConfigurationError(
                "case_intake_suggestions_provider 'openai_compatible' requires BEACON_CASE_INTAKE_SUGGESTIONS_OPENAI_MODEL."
            )

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def generate_suggestions(self, *, content: str) -> CaseIntakeSuggestionResult:
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You generate suggestion-only staff-facing summaries for anonymous case intake. "
                            "Return JSON with keys suggestion_only, staff_summary_suggestion, and suggested_tags. "
                            "Do not claim certainty or change official case state."
                        ),
                    },
                    {"role": "user", "content": content},
                ],
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        raw_content = (
            payload.get("choices", [{}])[0].get("message", {}).get("content")
            if isinstance(payload, dict)
            else None
        )
        if not isinstance(raw_content, str) or not raw_content.strip():
            raise ValueError("Case intake suggestion provider returned an invalid completion payload.")
        try:
            parsed = json.loads(raw_content)
        except json.JSONDecodeError as exc:
            raise ValueError("Case intake suggestion provider returned invalid JSON.") from exc
        return _parse_provider_result(parsed)


def get_case_intake_suggestion_provider() -> CaseIntakeSuggestionProvider:
    settings = get_settings()
    provider_name = settings.case_intake_suggestions_provider.strip().lower()
    if provider_name == "development_stub":
        return DevelopmentStubCaseIntakeSuggestionProvider()
    if provider_name == "openai_compatible":
        return OpenAICompatibleCaseIntakeSuggestionProvider(
            base_url=settings.case_intake_suggestions_openai_base_url,
            api_key=settings.case_intake_suggestions_openai_api_key or "",
            model=settings.case_intake_suggestions_openai_model,
            timeout_seconds=settings.case_intake_suggestions_timeout_seconds,
        )
    raise CaseIntakeSuggestionConfigurationError(
        f"Unsupported case_intake_suggestions_provider: {provider_name}"
    )


def generate_case_intake_suggestions(*, content: str) -> CaseIntakeSuggestionResult:
    return get_case_intake_suggestion_provider().generate_suggestions(content=content)


def _parse_provider_result(payload: object) -> CaseIntakeSuggestionResult:
    if not isinstance(payload, dict):
        raise ValueError("Case intake suggestion provider returned an invalid suggestion payload.")

    summary_payload = payload.get("staff_summary_suggestion")
    tags_payload = payload.get("suggested_tags")
    if not isinstance(summary_payload, dict) or not isinstance(tags_payload, dict):
        raise ValueError("Case intake suggestion provider returned an incomplete suggestion payload.")

    return CaseIntakeSuggestionResult(
        suggestion_only=bool(payload.get("suggestion_only", True)),
        staff_summary_suggestion=SuggestedCaseIntakeSummary(
            headline=_required_str(summary_payload, "headline"),
            situation_overview=_required_str(summary_payload, "situation_overview"),
            urgency_note=_required_str(summary_payload, "urgency_note"),
            recommended_follow_up=_string_list(summary_payload.get("recommended_follow_up")),
        ),
        suggested_tags=SuggestedCaseIntakeTags(
            urgency_cues=_string_list(tags_payload.get("urgency_cues")),
            missing_person_mentions=_string_list(tags_payload.get("missing_person_mentions")),
            incident_or_resource_types=_string_list(tags_payload.get("incident_or_resource_types")),
            follow_up_needs=_string_list(tags_payload.get("follow_up_needs")),
        ),
    )


def _required_str(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Case intake suggestion provider returned an invalid '{key}' value.")
    return value.strip()


def _string_list(value: object) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("Case intake suggestion provider returned an invalid list value.")
    normalized: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())
    return normalized


def _normalize_content(content: str) -> str:
    return re.sub(r"\s+", " ", content).strip()


def _truncate(content: str, *, limit: int) -> str:
    if len(content) <= limit:
        return content
    return f"{content[: limit - 3].rstrip()}..."


def _contains_any(content: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in content for keyword in keywords)


def _detect_urgency_cues(content: str) -> list[str]:
    tags: list[str] = []
    if _contains_any(content, ("immediate", "right now", "urgent", "asap", "can't breathe", "not breathing")):
        tags.append("immediate_danger")
    if _contains_any(content, ("bleeding", "unconscious", "overdose", "seizure", "injured", "medical")):
        tags.append("medical_emergency")
    if _contains_any(content, ("child", "kid", "minor", "baby")):
        tags.append("child_involved")
    return tags


def _detect_missing_person_mentions(content: str) -> list[str]:
    tags: list[str] = []
    if _contains_any(content, ("missing", "disappeared", "run away", "ran away", "not seen", "where is")):
        tags.append("possible_missing_person")
    if _contains_any(content, ("last seen", "last heard", "hours ago", "yesterday", "tonight")):
        tags.append("timeline_reference_present")
    return tags


def _detect_incident_or_resource_types(content: str) -> list[str]:
    detected: list[str] = []
    keyword_map = {
        "fire": ("fire", "smoke", "burning"),
        "medical": ("medical", "injured", "bleeding", "overdose", "seizure"),
        "shelter": ("shelter", "bed", "place to stay", "housing"),
        "food": ("food", "hungry", "meal", "groceries"),
        "transportation": ("ride", "transport", "bus fare", "taxi"),
        "domestic_violence": ("abuse", "violent partner", "domestic violence"),
    }
    for tag, keywords in keyword_map.items():
        if _contains_any(content, keywords):
            detected.append(tag)
    return detected


def _detect_follow_up_needs(content: str) -> list[str]:
    detected: list[str] = []
    if not _contains_any(content, (" at ", "street", "avenue", "road", "apartment", "near ", "location")):
        detected.append("location_confirmation_needed")
    if _contains_any(content, ("help", "need", "support", "resource", "safe place")):
        detected.append("resource_request_clarification")
    if _contains_any(content, ("unsafe", "danger", "threat", "afraid", "scared", "urgent", "immediate")):
        detected.append("immediate_safety_check")
    if _contains_any(content, ("call me", "text me", "email me")):
        detected.append("preferred_contact_method_noted")
    return detected


def _dedupe_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped
