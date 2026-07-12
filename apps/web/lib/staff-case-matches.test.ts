import assert from "node:assert/strict";
import test from "node:test";
import { findSuggestedCaseMatches } from "./staff-case-matches.ts";
import type { StaffCaseListItem } from "./api-types.ts";

const currentCase: StaffCaseListItem = {
  id: 1,
  case_code: "C-001",
  status: "pending_review",
  urgency: "high",
  incident_type: "shelter",
  location_summary: "North shelter desk",
  needs_summary: "One family needs transport to a safe shelter.",
  latest_public_update: null,
  assigned_staff_user: null,
  created_at: "2026-07-12T08:00:00.000Z",
  updated_at: "2026-07-12T08:10:00.000Z",
};

test("findSuggestedCaseMatches ranks matching open reports and excludes closed records", () => {
  const matches = findSuggestedCaseMatches(currentCase, [
    {
      ...currentCase,
      id: 2,
      case_code: "C-002",
      needs_summary: "Family needs transport from the shelter.",
      created_at: "2026-07-12T08:20:00.000Z",
    },
    {
      ...currentCase,
      id: 3,
      case_code: "C-003",
      status: "closed",
    },
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.case.id, 2);
  assert.ok(matches[0]?.reasons.includes("same_location"));
});
