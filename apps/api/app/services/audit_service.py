from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.audit_log_entry import AuditLogEntry
from app.models.enums import AuditActorType, AuditEventType


class AuditService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        *,
        actor_type: AuditActorType,
        event_type: AuditEventType,
        actor_user_id: Optional[int] = None,
        case_id: Optional[int] = None,
        share_link_id: Optional[int] = None,
        metadata_json: Optional[dict[str, Any]] = None,
    ) -> AuditLogEntry:
        entry = AuditLogEntry(
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            case_id=case_id,
            share_link_id=share_link_id,
            event_type=event_type,
            metadata_json=metadata_json,
        )
        self.db.add(entry)
        return entry
