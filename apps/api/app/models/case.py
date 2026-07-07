from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import CaseStatus, IncidentType, UrgencyLevel


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False, index=True)
    status: Mapped[CaseStatus] = mapped_column(
        SAEnum(CaseStatus, name="case_status"),
        default=CaseStatus.PENDING_REVIEW,
        nullable=False,
    )
    urgency: Mapped[UrgencyLevel] = mapped_column(
        SAEnum(UrgencyLevel, name="urgency_level"),
        nullable=False,
    )
    incident_type: Mapped[IncidentType] = mapped_column(
        SAEnum(IncidentType, name="incident_type"),
        nullable=False,
    )
    language_code: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    location_summary: Mapped[str] = mapped_column(String(280), nullable=False)
    needs_summary: Mapped[str] = mapped_column(Text, nullable=False)
    latest_public_update: Mapped[Optional[str]] = mapped_column(Text)
    reporter_name: Mapped[Optional[str]] = mapped_column(String(120))
    reporter_email: Mapped[Optional[str]] = mapped_column(String(320))
    reporter_phone: Mapped[Optional[str]] = mapped_column(String(40))
    assigned_staff_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    assigned_staff_user = relationship("User", back_populates="assigned_cases")
    share_links = relationship("CaseShareLink", back_populates="case")
    actions = relationship("CaseAction", back_populates="case")
    audit_entries = relationship("AuditLogEntry", back_populates="case")

