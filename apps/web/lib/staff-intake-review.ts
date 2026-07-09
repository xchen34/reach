import type { StaffCaseIntakeReviewResponse } from "@/lib/api-types";

export function buildAiDraft(review: StaffCaseIntakeReviewResponse) {
  if (review.status !== "ready" || !review.staff_summary_suggestion || !review.suggested_tags) {
    return "";
  }

  const sections = [
    "AI review draft copied for staff review.",
    `Headline: ${review.staff_summary_suggestion.headline}`,
    `Situation overview: ${review.staff_summary_suggestion.situation_overview}`,
    `Urgency note: ${review.staff_summary_suggestion.urgency_note}`,
    `Urgency cues: ${joinOrNone(review.suggested_tags.urgency_cues)}`,
    `Missing-person mentions: ${joinOrNone(review.suggested_tags.missing_person_mentions)}`,
    `Incident/resource types: ${joinOrNone(review.suggested_tags.incident_or_resource_types)}`,
    `Follow-up needs: ${joinOrNone(review.suggested_tags.follow_up_needs)}`,
  ];

  if (review.staff_summary_suggestion.recommended_follow_up.length > 0) {
    sections.push(
      "Recommended follow-up:",
      ...review.staff_summary_suggestion.recommended_follow_up.map((item) => `- ${item}`),
    );
  }

  return sections.join("\n");
}

function joinOrNone(values: string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}
