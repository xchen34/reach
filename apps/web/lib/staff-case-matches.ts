import type { StaffCaseListItem } from "@/lib/api-types";
// Relative so the node test runner can resolve it; @/ is a bundler-only alias.
import { parseNarrativeFields } from "./staff-narrative.ts";

export type MatchReason =
  | "same_name"
  | "similar_name"
  | "same_location"
  | "same_age"
  | "same_phone"
  | "similar_description"
  | "nearby_time";

export type MatchConfidence = "high" | "medium" | "low";

export type SuggestedCaseMatch = {
  case: StaffCaseListItem;
  reasons: MatchReason[];
  score: number;
  confidence: MatchConfidence;
};

const MATCH_THRESHOLD = 4;

/**
 * Cases that might describe the same subject as `currentCase`, most likely first.
 *
 * The previous version scored `similar_description` whenever two narratives
 * shared two tokens of three or more characters. Every intake narrative repeats
 * the form's own labels — "Submission type", "Current status", "Situation",
 * "Information source" — so that signal fired for essentially every pair. Add
 * the incident-wide `same_type` point and any two records reached the threshold
 * with no name and no location in common: measured against real data, 45 of 45
 * pairs were reported as possible duplicates.
 *
 * Now only the *values* of the narrative are compared, never the labels, and two
 * records whose names clearly disagree are rejected outright however much other
 * circumstantial evidence they share.
 */
export function findSuggestedCaseMatches(
  currentCase: StaffCaseListItem,
  candidates: StaffCaseListItem[],
): SuggestedCaseMatch[] {
  return candidates
    .filter((candidate) => candidate.id !== currentCase.id && candidate.status !== "closed")
    .map((candidate) => scoreCaseMatch(currentCase, candidate))
    .filter((match): match is SuggestedCaseMatch => match !== null)
    .sort((left, right) => right.score - left.score || newerFirst(left.case, right.case))
    .slice(0, 4);
}

function scoreCaseMatch(
  currentCase: StaffCaseListItem,
  candidate: StaffCaseListItem,
): SuggestedCaseMatch | null {
  const reasons: MatchReason[] = [];
  let score = 0;

  const nameVerdict = compareNames(currentCase.person_label, candidate.person_label);
  // Two named records with different names are different people. No amount of
  // shared location or timing should present them as possible duplicates.
  if (nameVerdict === "conflict") {
    return null;
  }
  if (nameVerdict === "same") {
    score += 6;
    reasons.push("same_name");
  } else if (nameVerdict === "similar") {
    score += 4;
    reasons.push("similar_name");
  }

  if (normalize(currentCase.location_summary) === normalize(candidate.location_summary)) {
    score += 3;
    reasons.push("same_location");
  }

  if (sameApproximateAge(currentCase.approximate_age, candidate.approximate_age)) {
    score += 2;
    reasons.push("same_age");
  }

  if (samePhone(currentCase.reporter_phone, candidate.reporter_phone)) {
    score += 4;
    reasons.push("same_phone");
  }

  if (sharedNarrativeValueTerms(currentCase.needs_summary, candidate.needs_summary) >= 2) {
    score += 2;
    reasons.push("similar_description");
  }

  if (
    Math.abs(Date.parse(currentCase.created_at) - Date.parse(candidate.created_at)) <=
    24 * 60 * 60 * 1000
  ) {
    score += 1;
    reasons.push("nearby_time");
  }

  // Timing alone is not evidence about a person; require something identifying.
  const hasSubstantiveSignal = reasons.some(
    (reason) =>
      reason === "same_name" ||
      reason === "similar_name" ||
      reason === "same_location" ||
      reason === "same_phone",
  );
  if (!hasSubstantiveSignal || score < MATCH_THRESHOLD) {
    return null;
  }

  return { case: candidate, reasons, score, confidence: toConfidence(score) };
}

function toConfidence(score: number): MatchConfidence {
  if (score >= 9) {
    return "high";
  }
  if (score >= 6) {
    return "medium";
  }
  return "low";
}

type NameVerdict = "same" | "similar" | "conflict" | "unknown";

/**
 * Names are compared on tokens rather than raw strings, so reversed order
 * ("Leroy Thomas") and accents ("Aïcha"/"Aicha") still match. CJK names carry no
 * spaces, so those fall back to containment.
 */
export function compareNames(
  left: string | null | undefined,
  right: string | null | undefined,
): NameVerdict {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) {
    return "unknown";
  }
  if (a === b) {
    return "same";
  }

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (aTokens.size > 1 || bTokens.size > 1) {
    const shared = [...aTokens].filter((token) => bTokens.has(token));
    if (shared.length === aTokens.size && shared.length === bTokens.size) {
      return "same";
    }
    // One name is a subset of the other, e.g. "Thomas Leroy" vs "Leroy".
    if (shared.length > 0 && (shared.length === aTokens.size || shared.length === bTokens.size)) {
      return "similar";
    }
    if (shared.length > 0) {
      return "similar";
    }
  }

  // No spaces to work with: containment covers CJK and single-token names.
  if (a.includes(b) || b.includes(a)) {
    return "similar";
  }
  if (editDistanceWithin(a, b, a.length <= 6 ? 1 : 2)) {
    return "similar";
  }
  return "conflict";
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap bounded Levenshtein: enough to absorb a typo, not to guess. */
function editDistanceWithin(a: string, b: string, budget: number) {
  if (Math.abs(a.length - b.length) > budget) {
    return false;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] <= budget;
}

function sameApproximateAge(left: string | null | undefined, right: string | null | undefined) {
  const a = Number.parseInt(String(left ?? "").replace(/[^0-9]/g, ""), 10);
  const b = Number.parseInt(String(right ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  return Math.abs(a - b) <= 2;
}

function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const a = String(left ?? "").replace(/[^0-9]/g, "");
  const b = String(right ?? "").replace(/[^0-9]/g, "");
  // Compare the subscriber part so differing country prefixes still match.
  if (a.length < 7 || b.length < 7) {
    return false;
  }
  return a.slice(-7) === b.slice(-7);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9一-鿿]+/g, "");
}

/**
 * Overlap between what reporters actually wrote, ignoring the intake form's
 * field labels — those are identical on every record and made this signal fire
 * for every possible pair.
 */
function sharedNarrativeValueTerms(left: string, right: string) {
  const leftTerms = new Set(narrativeValueTokens(left));
  return narrativeValueTokens(right).filter((term) => leftTerms.has(term)).length;
}

function narrativeValueTokens(value: string) {
  const { fields, rest } = parseNarrativeFields(value);
  const text = fields.length ? [...fields.map((field) => field.value), rest].join(" ") : value;
  return tokenize(text).filter((token) => !boilerplateTokens.has(token));
}

// Words that appear in the form's own option text rather than in anything a
// reporter chose to say about a specific person.
const boilerplateTokens = new Set([
  "submission",
  "type",
  "subject",
  "unknown",
  "person",
  "report",
  "about",
  "already",
  "reported",
  "current",
  "status",
  "situation",
  "information",
  "source",
  "update",
  "details",
  "contact",
  "last",
  "vulnerabilities",
  "directly",
  "personally",
  "know",
  "the",
  "and",
  "came",
  "from",
  "someone",
  "else",
  "online",
]);

function tokenize(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9一-鿿]+/)
    .filter((term) => term.length >= 3);
}

function newerFirst(left: StaffCaseListItem, right: StaffCaseListItem) {
  return Date.parse(right.updated_at) - Date.parse(left.updated_at);
}
