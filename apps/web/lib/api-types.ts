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
export const reportTriageStatuses = [
  "awaiting_review",
  "linked_to_case",
  "linked_to_new_case",
  "linked_to_existing_case",
  "out_of_scope",
  "invalid_or_insufficient",
] as const;
export const subjectTypes = ["person", "pet", "unknown"] as const;
export const attachmentModerationStatuses = ["pending", "approved", "rejected"] as const;

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
export type ReportTriageStatus = (typeof reportTriageStatuses)[number];
export type SubjectType = (typeof subjectTypes)[number];
export type AttachmentModerationStatus = (typeof attachmentModerationStatuses)[number];
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

export type IncidentStatus = "draft" | "active" | "intake_paused" | "closed" | "archived";
export type OperationalStatus = "unassigned" | "in_progress" | "found_alive" | "confirmed_deceased";

export interface PublicIncidentReportPageResponse {
  id: number;
  public_name: string;
  slug: string;
  disaster_type: string;
  affected_area: string;
  incident_start_time: string | null;
  public_description: string | null;
  supported_languages: string[];
  status: IncidentStatus;
  google_form_url: string;
}

export interface ShareLinkCaseView {
  case_code: string;
  status: CaseStatus;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  created_at: string;
}

export interface PublicBoardRecord {
  public_id: string;
  operational_status: OperationalStatus;
  subject_type: SubjectType;
  person_label: string | null;
  approximate_age: string | null;
  gender: string | null;
  last_known_location: string;
  latest_public_update: string | null;
  platform_last_updated_at: string;
  public_image: PublicBoardAttachment | null;
}

export interface PublicBoardAttachment {
  id: number;
  url: string;
  content_type: string;
  byte_size: number;
}

export interface PublicBoardSummary {
  total_records: number;
  unassigned: number;
  in_progress: number;
  found_alive: number;
  confirmed_deceased: number;
}

export interface PublicBoardResponse {
  source_mode: "case_tasks";
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

export interface StaffIncidentIntakeSource {
  id: number;
  incident_id: number;
  source_type: "google_sheets";
  google_form_url: string;
  google_form_id: string | null;
  google_sheet_name: string;
  last_imported_row: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffIncidentSummary {
  id: number;
  internal_name: string;
  public_name: string;
  slug: string;
  disaster_type: string;
  affected_area: string;
  status: IncidentStatus;
  intake_sources: StaffIncidentIntakeSource[];
}

export interface StaffCaseListItem {
  id: number;
  incident_id: number;
  case_code: string;
  status: CaseStatus;
  urgency: UrgencyLevel;
  incident_type: IncidentType;
  location_summary: string;
  needs_summary: string;
  latest_public_update: string | null;
  reporter_phone?: string | null;
  subject_type?: SubjectType;
  person_label?: string | null;
  approximate_age?: string | null;
  last_known_location?: string | null;
  safety_status?:
    | "unknown"
    | "possibly_at_risk"
    | "confirmed_safe"
    | "suspected_deceased_awaiting_authorized_confirmation"
    | "confirmed_deceased";
  handling_status?:
    | "awaiting_action"
    | "being_investigated"
    | "escalated_to_rescuers"
    | "awaiting_external_feedback"
    | "archived";
  verification_task?:
    | "confirm_identity"
    | "confirm_last_known_location"
    | "compare_possible_same_person"
    | "contact_reporter"
    | "await_responder_feedback"
    | "await_authorized_confirmation"
    | "none";
  assigned_staff_user: StaffUserSummary | null;
  operational_status?: OperationalStatus;
  source_report_count?: number;
  platform_last_updated_at?: string;
  attachments?: StaffAttachment[];
  created_at: string;
  updated_at: string;
}

export interface StaffQueueGroup {
  id: string;
  title: string;
  status: CaseStatus;
  publish_state: "awaiting_verification" | "ready_to_publish" | "published";
  subject_name: string | null;
  source_relationship: string | null;
  update_chain_count: number;
  report_kind: string | null;
  case_count: number;
  open_case_count: number;
  unassigned_case_count: number;
  highest_urgency: UrgencyLevel;
  incident_type: IncidentType;
  last_updated_at: string;
  summary: string;
  latest_public_update: string | null;
  related_cases: StaffCaseListItem[];
}

export interface StaffQueueSummary {
  total_events: number;
  total_cases: number;
  open_cases: number;
  unassigned_cases: number;
  critical_cases: number;
  awaiting_verification_groups: number;
  ready_to_publish_groups: number;
  published_groups: number;
  last_updated_at: string | null;
}

export interface StaffQueueResponse {
  source: "staff-queue-adapter";
  events: StaffQueueGroup[];
  summary: StaffQueueSummary;
}

export interface ReportCaseSummary {
  id: number;
  incident_id: number;
  case_code: string;
  person_label: string | null;
  subject_type: SubjectType;
  safety_status:
    | "unknown"
    | "possibly_at_risk"
    | "confirmed_safe"
    | "suspected_deceased_awaiting_authorized_confirmation"
    | "confirmed_deceased";
  handling_status:
    | "awaiting_action"
    | "being_investigated"
    | "escalated_to_rescuers"
    | "awaiting_external_feedback"
    | "archived";
}

export interface StaffAttachment {
  id: number;
  report_id: number | null;
  case_id: number | null;
  attachment_code: string;
  original_filename: string | null;
  content_type: string;
  byte_size: number;
  public_visibility: boolean;
  moderation_status: AttachmentModerationStatus;
  created_at: string;
  linked_at: string | null;
}

export interface StaffReportListItem {
  id: number;
  incident_id: number;
  intake_source_id: number | null;
  report_code: string;
  source_channel: "google_form" | "anonymous_web" | "voice" | "manual_staff_entry" | "legacy_migration";
  source_form_id: string | null;
  source_form_name: string | null;
  source_entry_id: string | null;
  submitted_at: string | null;
  received_at: string;
  language_code: string;
  triage_status: ReportTriageStatus;
  reporter_relationship: string | null;
  is_first_hand: boolean | null;
  permission_to_contact: boolean | null;
  subject_type: SubjectType;
  location_text: string;
  original_narrative_preview: string;
  submission_type: string | null;
  person_name: string | null;
  approximate_age: string | null;
  gender: string | null;
  current_status: string | null;
  linked_case: ReportCaseSummary | null;
  legacy_case_id: number | null;
  is_legacy_backfill: boolean;
  migration_note: string | null;
  source_label: string;
  attachments: StaffAttachment[];
}

export interface PublicAttachmentUploadItem {
  id: number;
  original_filename: string | null;
  content_type: string;
  byte_size: number;
}

export interface PublicAttachmentUploadResponse {
  attachment_code: string;
  max_images: number;
  attachments: PublicAttachmentUploadItem[];
}

export interface StaffReportInboxResponse {
  reports: StaffReportListItem[];
}

export interface StaffCaseOutcomeRequest {
  note?: string | null;
  confirmation_source?: string | null;
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

export type StaffCaseRelationType =
  | "possible_duplicate"
  | "confirmed_duplicate"
  | "related_update";

export interface StaffCaseRelationRequest {
  related_case_id: number;
  relation_type: StaffCaseRelationType;
  note?: string | null;
}

export interface StaffCaseRelationResponse {
  case_id: number;
  related_case_id: number;
  relation_type: StaffCaseRelationType;
  note: string | null;
  created_at: string;
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
