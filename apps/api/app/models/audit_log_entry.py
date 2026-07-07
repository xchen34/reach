from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import AuditActorType, AuditEventType


class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_type: Mapped[AuditActorType] = mapped_column(
        SAEnum(AuditActorType, name="audit_actor_type"),
        nullable=False,
    )
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"), index=True)
    share_link_id: Mapped[Optional[int]] = mapped_column(ForeignKey("case_share_links.id"), index=True)
    event_type: Mapped[AuditEventType] = mapped_column(
        SAEnum(AuditEventType, name="audit_event_type"),
        nullable=False,
    )
    metadata_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    actor_user = relationship("User", back_populates="audit_entries")
    case = relationship("Case", back_populates="audit_entries")
    share_link = relationship("CaseShareLink", back_populates="audit_entries")

