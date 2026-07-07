export const incidentTypes = [
  "medical",
  "fire",
  "evacuation",
  "shelter",
  "utilities",
  "other",
] as const;

export const urgencyLevels = ["low", "medium", "high", "critical"] as const;

export const caseStatuses = [
  "pending_review",
  "active",
  "waiting_for_information",
  "safe_resolved",
  "closed",
] as const;

export type IncidentType = (typeof incidentTypes)[number];
export type UrgencyLevel = (typeof urgencyLevels)[number];
export type CaseStatus = (typeof caseStatuses)[number];
export type ShareLinkScope = "status_only";

export interface AnonymousCaseSubmissionRequest {
  incident_type: IncidentType;
  urgency: UrgencyLevel;
  language_code: string;
  location_summary: string;
  needs_summary: string;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_phone?: string | null;
}

export interface ShareLinkSummary {
  token: string;
  url: string;
  scope: ShareLinkScope;
}

export interface CaseSubmissionResponse {
  id: number;
  case_code: string;
  status: CaseStatus;
  share_link: ShareLinkSummary;
  created_at: string;
}

export interface ShareLinkCaseView {
  case_code: string;
  status: CaseStatus;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  created_at: string;
}
