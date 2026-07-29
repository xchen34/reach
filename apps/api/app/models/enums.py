from __future__ import annotations

from enum import Enum


class StaffRole(str, Enum):
    VOLUNTEER = "volunteer"
    COORDINATOR = "coordinator"


class CaseStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"
    WAITING_FOR_INFORMATION = "waiting_for_information"
    SAFE_RESOLVED = "safe_resolved"
    CLOSED = "closed"


class ReportSourceChannel(str, Enum):
    GOOGLE_FORM = "google_form"
    ANONYMOUS_WEB = "anonymous_web"
    VOICE = "voice"
    MANUAL_STAFF_ENTRY = "manual_staff_entry"
    LEGACY_MIGRATION = "legacy_migration"


class ReportTriageStatus(str, Enum):
    AWAITING_REVIEW = "awaiting_review"
    LINKED_TO_CASE = "linked_to_case"
    LINKED_TO_NEW_CASE = "linked_to_new_case"
    LINKED_TO_EXISTING_CASE = "linked_to_existing_case"
    OUT_OF_SCOPE = "out_of_scope"
    INVALID_OR_INSUFFICIENT = "invalid_or_insufficient"


class ReportTriageActionType(str, Enum):
    CREATE_CASE = "create_case"
    LINK_EXISTING_CASE = "link_existing_case"
    MARK_OUT_OF_SCOPE = "mark_out_of_scope"
    MARK_INVALID_OR_INSUFFICIENT = "mark_invalid_or_insufficient"
    NOTE = "note"


class SubjectType(str, Enum):
    PERSON = "person"
    PET = "pet"
    UNKNOWN = "unknown"


class AttachmentModerationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CaseSafetyStatus(str, Enum):
    UNKNOWN = "unknown"
    POSSIBLY_AT_RISK = "possibly_at_risk"
    CONFIRMED_SAFE = "confirmed_safe"
    SUSPECTED_DECEASED_AWAITING_AUTHORIZED_CONFIRMATION = (
        "suspected_deceased_awaiting_authorized_confirmation"
    )
    CONFIRMED_DECEASED = "confirmed_deceased"


class CaseHandlingStatus(str, Enum):
    AWAITING_ACTION = "awaiting_action"
    BEING_INVESTIGATED = "being_investigated"
    ESCALATED_TO_RESCUERS = "escalated_to_rescuers"
    AWAITING_EXTERNAL_FEEDBACK = "awaiting_external_feedback"
    ARCHIVED = "archived"


class CaseVerificationTask(str, Enum):
    CONFIRM_IDENTITY = "confirm_identity"
    CONFIRM_LAST_KNOWN_LOCATION = "confirm_last_known_location"
    COMPARE_POSSIBLE_SAME_PERSON = "compare_possible_same_person"
    CONTACT_REPORTER = "contact_reporter"
    AWAIT_RESPONDER_FEEDBACK = "await_responder_feedback"
    AWAIT_AUTHORIZED_CONFIRMATION = "await_authorized_confirmation"
    NONE = "none"


class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentType(str, Enum):
    MEDICAL = "medical"
    FIRE = "fire"
    EVACUATION = "evacuation"
    SHELTER = "shelter"
    UTILITIES = "utilities"
    OTHER = "other"


class IncidentStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    INTAKE_PAUSED = "intake_paused"
    CLOSED = "closed"
    ARCHIVED = "archived"


class IntakeSourceType(str, Enum):
    GOOGLE_SHEETS = "google_sheets"


class CaseActionType(str, Enum):
    NOTE = "note"
    STATUS_CHANGE = "status_change"
    CLAIM = "claim"
    REASSIGN = "reassign"


class AuditActorType(str, Enum):
    ANONYMOUS = "anonymous"
    STAFF = "staff"
    SYSTEM = "system"


class AuditEventType(str, Enum):
    MAGIC_LINK_REQUESTED = "magic_link_requested"
    MAGIC_LINK_VERIFIED = "magic_link_verified"
    SESSION_CREATED = "session_created"
    CASE_SUBMITTED = "case_submitted"
    CASE_VIEWED = "case_viewed"
    CASE_ACTION_CREATED = "case_action_created"
    SHARE_LINK_CREATED = "share_link_created"
    SHARE_LINK_VIEWED = "share_link_viewed"
    VOICE_INTAKE_UPLOADED = "voice_intake_uploaded"
    VOICE_TRANSCRIPT_CONFIRMED = "voice_transcript_confirmed"
    VOICE_TRANSCRIPT_ATTACHED = "voice_transcript_attached"
    STAFF_VOICE_AUDIO_ACCESSED = "staff_voice_audio_accessed"
    REPORT_RECEIVED = "report_received"
    REPORT_TRIAGED = "report_triaged"
    REPORT_LINKED_TO_CASE = "report_linked_to_case"
    INTAKE_SOURCE_IMPORTED = "intake_source_imported"


class ShareLinkScope(str, Enum):
    STATUS_ONLY = "status_only"


class VoiceProcessingStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class VoiceTranscriptState(str, Enum):
    GENERATED = "generated"
    CONFIRMED = "confirmed"
    EDITED = "edited"


class VoiceRetentionState(str, Enum):
    RETAINED = "retained"
    DELETED = "deleted"
