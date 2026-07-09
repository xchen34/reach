export const incidentTypes = [
  "medical",
  "fire",
  "evacuation",
  "shelter",
  "utilities",
  "other",
] as const;

export const urgencyLevels = ["low", "medium", "high", "critical"] as const;
export const staffRoles = ["volunteer", "coordinator"] as const;
export const caseActionTypes = ["note", "status_change", "claim", "reassign"] as const;
export const voiceProcessingStatuses = ["pending", "completed", "failed"] as const;
export const voiceTranscriptStates = ["generated", "confirmed", "edited"] as const;
export const voiceRetentionStates = ["retained", "deleted"] as const;

export const caseStatuses = [
  "pending_review",
  "active",
  "waiting_for_information",
  "safe_resolved",
  "closed",
] as const;

export type IncidentType = (typeof incidentTypes)[number];
export type UrgencyLevel = (typeof urgencyLevels)[number];
export type StaffRole = (typeof staffRoles)[number];
export type CaseActionType = (typeof caseActionTypes)[number];
export type CaseStatus = (typeof caseStatuses)[number];
export type ShareLinkScope = "status_only";
export type VoiceProcessingStatus = (typeof voiceProcessingStatuses)[number];
export type VoiceTranscriptState = (typeof voiceTranscriptStates)[number];
export type VoiceRetentionState = (typeof voiceRetentionStates)[number];
export type PublicBoardStatus =
  | "unverified"
  | "responding"
  | "needs_follow_up"
  | "safe_confirmed"
  | "archived";

export interface ShareLinkCaseView {
  case_code: string;
  status: CaseStatus;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  created_at: string;
}

export interface PublicBoardRecord {
  case_code: string;
  board_status: PublicBoardStatus;
  urgency: UrgencyLevel;
  incident_type: IncidentType;
  language_code: string;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicBoardSummary {
  total_records: number;
  unverified: number;
  responding: number;
  needs_follow_up: number;
  safe_confirmed: number;
  archived: number;
}

export interface PublicBoardResponse {
  source_mode: "derived_from_cases";
  records: PublicBoardRecord[];
  summary: PublicBoardSummary;
}

export interface StaffUserSummary {
  id: number;
  email: string;
  role: StaffRole;
}

export interface StaffMagicLinkRequestResponse {
  message: string;
  expires_at: string;
  login_url?: string | null;
}

export interface StaffSessionResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  magic_link_status?: string;
  user: StaffUserSummary;
}

export interface CurrentStaffSession {
  user: StaffUserSummary;
  session_expires_at: string;
}

export interface StaffCaseListItem {
  id: number;
  case_code: string;
  status: CaseStatus;
  urgency: UrgencyLevel;
  incident_type: IncidentType;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  assigned_staff_user: StaffUserSummary | null;
  created_at: string;
  updated_at: string;
}

export interface StaffCaseDetailResponse extends StaffCaseListItem {
  language_code: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
}

export interface StaffCaseVoiceResponse {
  id: number;
  case_id: number;
  processing_status: VoiceProcessingStatus;
  content_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  transcription_text: string | null;
  transcription_language_code: string | null;
  transcription_confidence: number | null;
  confirmed_transcript_text: string | null;
  transcript_state: VoiceTranscriptState;
  retention_state: VoiceRetentionState;
  audio_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffSuggestedCaseIntakeSummary {
  headline: string;
  situation_overview: string;
  urgency_note: string;
  recommended_follow_up: string[];
}

export interface StaffSuggestedCaseIntakeTags {
  urgency_cues: string[];
  missing_person_mentions: string[];
  incident_or_resource_types: string[];
  follow_up_needs: string[];
}

export interface StaffCaseIntakeReviewResponse {
  status: "ready" | "unavailable";
  suggestion_only: boolean;
  source_inputs: string[];
  source_preview: string;
  disclaimer: string;
  staff_summary_suggestion: StaffSuggestedCaseIntakeSummary | null;
  suggested_tags: StaffSuggestedCaseIntakeTags | null;
  fallback_message: string | null;
}

export interface StaffCaseActionRequest {
  action_type: CaseActionType;
  note?: string | null;
  to_status?: CaseStatus | null;
  target_staff_user_id?: number | null;
}

export interface StaffCasePublishRequest {
  to_status: CaseStatus;
  latest_public_update: string;
}

export interface StaffCasePublishResponse {
  case_id: number;
  status: CaseStatus;
  latest_public_update: string;
  published_at: string;
}

export interface StaffCaseActionResponse {
  id: number;
  case_id: number;
  actor_user_id: number | null;
  action_type: CaseActionType;
  note: string | null;
  from_status: CaseStatus | null;
  to_status: CaseStatus | null;
  target_staff_user_id: number | null;
  created_at: string;
}

export interface AuditLogEntryResponse {
  id: number;
  actor_type: string;
  actor_user_id: number | null;
  case_id: number | null;
  share_link_id: number | null;
  event_type: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}
