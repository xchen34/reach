from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.voice_intake import VoiceIntake
from app.schemas.intake_review import (
    StaffCaseIntakeReviewResponse,
    StaffSuggestedCaseIntakeSummary,
    StaffSuggestedCaseIntakeTags,
)
from app.services.case_intake_suggestions import generate_case_intake_suggestions


class CaseIntakeReviewService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_staff_review(self, case_id: int) -> StaffCaseIntakeReviewResponse | None:
        case = self.db.get(Case, case_id)
        if case is None:
            return None

        content, source_inputs = self._build_review_content(case)
        try:
            suggestion = generate_case_intake_suggestions(content=content)
        except Exception:
            return StaffCaseIntakeReviewResponse(
                status="unavailable",
                suggestion_only=True,
                source_inputs=source_inputs,
                source_preview=_truncate(content, limit=280),
                disclaimer=(
                    "AI review is suggestion-only. A staff member must verify the original intake before "
                    "any official note or status update is recorded."
                ),
                fallback_message=(
                    "AI review is unavailable right now. Review the submitted intake and any confirmed transcript directly."
                ),
            )

        return StaffCaseIntakeReviewResponse(
            status="ready",
            suggestion_only=suggestion.suggestion_only,
            source_inputs=source_inputs,
            source_preview=_truncate(content, limit=280),
            disclaimer=(
                "Suggestion only. Human staff must confirm any AI-derived summary or tag before it affects the official case record."
            ),
            staff_summary_suggestion=StaffSuggestedCaseIntakeSummary(
                headline=suggestion.staff_summary_suggestion.headline,
                situation_overview=suggestion.staff_summary_suggestion.situation_overview,
                urgency_note=suggestion.staff_summary_suggestion.urgency_note,
                recommended_follow_up=suggestion.staff_summary_suggestion.recommended_follow_up,
            ),
            suggested_tags=StaffSuggestedCaseIntakeTags(
                urgency_cues=suggestion.suggested_tags.urgency_cues,
                missing_person_mentions=suggestion.suggested_tags.missing_person_mentions,
                incident_or_resource_types=suggestion.suggested_tags.incident_or_resource_types,
                follow_up_needs=suggestion.suggested_tags.follow_up_needs,
            ),
        )

    def _build_review_content(self, case: Case) -> tuple[str, list[str]]:
        voice_intake = self.db.scalar(select(VoiceIntake).where(VoiceIntake.case_id == case.id))
        source_inputs = ["submitted form"]
        parts = [
            f"Incident type: {case.incident_type.value}",
            f"Urgency: {case.urgency.value}",
            f"Language: {case.language_code}",
            f"Location summary: {case.location_summary}",
            f"Needs summary: {case.needs_summary}",
        ]

        confirmed_transcript = None
        if voice_intake is not None and voice_intake.confirmed_transcript_text:
            confirmed_transcript = voice_intake.confirmed_transcript_text.strip()

        if confirmed_transcript:
            source_inputs.append("confirmed voice transcript")
            parts.append(f"Confirmed voice transcript: {confirmed_transcript}")

        return "\n".join(parts), source_inputs


def _truncate(content: str, *, limit: int) -> str:
    normalized = " ".join(content.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 3].rstrip()}..."
