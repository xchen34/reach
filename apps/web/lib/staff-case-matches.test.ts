import assert from "node:assert/strict";
import test from "node:test";
import { findSuggestedCaseMatches } from "./staff-case-matches.ts";
import type { StaffCaseListItem } from "./api-types.ts";

const currentCase: StaffCaseListItem = {
  id: 1,
  incident_id: 1,
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

const named: StaffCaseListItem = {
  ...currentCase,
  person_label: "Thomas Leroy",
  approximate_age: "46",
  needs_summary:
    "Submission type: A new report about a person Person: Thomas Leroy Current status: Missing or unreachable Situation: A voice message said the door was blocked.",
};

test("boilerplate shared by every intake narrative is not treated as similarity", () => {
  // Two unrelated people at different addresses. Every narrative repeats the
  // form's own labels, which used to be enough to clear the threshold.
  const other: StaffCaseListItem = {
    ...named,
    id: 2,
    case_code: "C-002",
    person_label: "Hugo Fernandes",
    location_summary: "9 rue du Moulin",
    approximate_age: "67",
    needs_summary:
      "Submission type: A new report about a person Person: Hugo Fernandes Current status: Needs a welfare check Situation: Has not responded since the power outage.",
  };

  assert.deepEqual(findSuggestedCaseMatches(named, [other]), []);
});

test("records with clearly different names are never suggested, however much else matches", () => {
  const sameEverythingElse: StaffCaseListItem = {
    ...named,
    id: 3,
    case_code: "C-003",
    person_label: "Amina Diallo",
  };

  assert.deepEqual(findSuggestedCaseMatches(named, [sameEverythingElse]), []);
});

test("name variants still match: reversed order, dropped accent, and a typo", () => {
  const variants = [
    { ...named, id: 4, case_code: "C-004", person_label: "Leroy Thomas" },
    { ...named, id: 5, case_code: "C-005", person_label: "Thomás Leroy" },
    { ...named, id: 6, case_code: "C-006", person_label: "Thomas Leroi" },
  ];

  for (const variant of variants) {
    const matches = findSuggestedCaseMatches(named, [variant]);
    assert.equal(matches.length, 1, `expected a match for ${variant.person_label}`);
    assert.ok(
      matches[0]?.reasons.includes("same_name") || matches[0]?.reasons.includes("similar_name"),
      `expected a name reason for ${variant.person_label}`,
    );
  }
});

test("a shared reporter phone is strong evidence and carries confidence", () => {
  const samePhone: StaffCaseListItem = {
    ...named,
    id: 7,
    case_code: "C-007",
    reporter_phone: "+33 6 12 34 56 78",
  };
  const match = findSuggestedCaseMatches({ ...named, reporter_phone: "0612345678" }, [samePhone])[0];

  assert.ok(match, "expected a match");
  assert.ok(match.reasons.includes("same_phone"));
  assert.equal(match.confidence, "high");
});

test("timing alone never suggests a duplicate", () => {
  const onlyTiming: StaffCaseListItem = {
    ...currentCase,
    id: 8,
    case_code: "C-008",
    location_summary: "Somewhere else entirely",
    needs_summary: "A completely unrelated situation involving livestock.",
  };

  assert.deepEqual(findSuggestedCaseMatches(currentCase, [onlyTiming]), []);
});
