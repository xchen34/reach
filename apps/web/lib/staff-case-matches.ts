import type { StaffCaseListItem } from "@/lib/api-types";

export type SuggestedCaseMatch = {
  case: StaffCaseListItem;
  reasons: Array<"same_location" | "similar_description" | "same_type" | "nearby_time">;
  score: number;
};

export function findSuggestedCaseMatches(
  currentCase: StaffCaseListItem,
  candidates: StaffCaseListItem[],
): SuggestedCaseMatch[] {
  return candidates
    .filter((candidate) => candidate.id !== currentCase.id && candidate.status !== "closed")
    .map((candidate) => scoreCaseMatch(currentCase, candidate))
    .filter((match) => match.score >= 3)
    .sort((left, right) => right.score - left.score || newerFirst(left.case, right.case))
    .slice(0, 4);
}

function scoreCaseMatch(
  currentCase: StaffCaseListItem,
  candidate: StaffCaseListItem,
): SuggestedCaseMatch {
  const reasons: SuggestedCaseMatch["reasons"] = [];
  let score = 0;

  if (normalize(currentCase.location_summary) === normalize(candidate.location_summary)) {
    score += 5;
    reasons.push("same_location");
  }

  if (sharedTerms(currentCase.needs_summary, candidate.needs_summary) >= 2) {
    score += 2;
    reasons.push("similar_description");
  }

  if (currentCase.incident_type === candidate.incident_type) {
    score += 1;
    reasons.push("same_type");
  }

  if (Math.abs(Date.parse(currentCase.created_at) - Date.parse(candidate.created_at)) <= 24 * 60 * 60 * 1000) {
    score += 1;
    reasons.push("nearby_time");
  }

  return { case: candidate, reasons, score };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function sharedTerms(left: string, right: string) {
  const leftTerms = new Set(tokenize(left));
  return tokenize(right).filter((term) => leftTerms.has(term)).length;
}

function tokenize(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((term) => term.length >= 3);
}

function newerFirst(left: StaffCaseListItem, right: StaffCaseListItem) {
  return Date.parse(right.updated_at) - Date.parse(left.updated_at);
}
