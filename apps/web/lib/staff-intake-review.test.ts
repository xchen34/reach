import test from "node:test";
import assert from "node:assert/strict";

import type { StaffCaseIntakeReviewResponse } from "./api-types";

const { buildAiDraft } = await import(new URL("./staff-intake-review.ts", import.meta.url).href);

test("buildAiDraft uses neutral review wording and preserves suggested content", () => {
  const review: StaffCaseIntakeReviewResponse = {
    status: "ready",
    suggestion_only: true,
    source_inputs: ["submitted form", "confirmed voice transcript"],
    source_preview: "preview",
    disclaimer: "Suggestion only.",
    staff_summary_suggestion: {
      headline: "Suggestion only; possible fire",
      situation_overview: "Smoke reported near the east stairwell.",
      urgency_note: "Potential urgent cue detected.",
      recommended_follow_up: ["Confirm current location.", "Check immediate safety."],
    },
    suggested_tags: {
      urgency_cues: ["immediate_danger"],
      missing_person_mentions: [],
      incident_or_resource_types: ["fire"],
      follow_up_needs: ["immediate_safety_check"],
    },
    fallback_message: null,
  };

  const draft = buildAiDraft(review);

  assert.match(draft, /^AI review draft copied for staff review\./);
  assert.ok(!draft.includes("AI review confirmed by staff."));
  assert.match(draft, /Headline: Suggestion only; possible fire/);
  assert.match(draft, /Missing-person mentions: none/);
  assert.match(draft, /- Confirm current location\./);
});

test("buildAiDraft returns an empty string when the review is unavailable", () => {
  const review: StaffCaseIntakeReviewResponse = {
    status: "unavailable",
    suggestion_only: true,
    source_inputs: [],
    source_preview: "",
    disclaimer: "Suggestion only.",
    staff_summary_suggestion: null,
    suggested_tags: null,
    fallback_message: "Unavailable.",
  };

  assert.equal(buildAiDraft(review), "");
});
