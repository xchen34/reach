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


class ShareLinkScope(str, Enum):
    STATUS_ONLY = "status_only"

