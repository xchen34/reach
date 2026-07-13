from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import (
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseStatus,
    CaseVerificationTask,
    IncidentType,
    UrgencyLevel,
)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False, index=True)
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
    person_label: Mapped[Optional[str]] = mapped_column(String(160))
    approximate_age: Mapped[Optional[str]] = mapped_column(String(80))
    appearance: Mapped[Optional[str]] = mapped_column(Text)
    clothing: Mapped[Optional[str]] = mapped_column(Text)
    identifying_details: Mapped[Optional[str]] = mapped_column(Text)
    mobility: Mapped[Optional[str]] = mapped_column(String(160))
    companions: Mapped[Optional[str]] = mapped_column(Text)
    last_known_location: Mapped[Optional[str]] = mapped_column(String(280))
    last_known_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    safety_status: Mapped[CaseSafetyStatus] = mapped_column(
        SAEnum(CaseSafetyStatus, name="case_safety_status"),
        default=CaseSafetyStatus.UNKNOWN,
        nullable=False,
        index=True,
    )
    handling_status: Mapped[CaseHandlingStatus] = mapped_column(
        SAEnum(CaseHandlingStatus, name="case_handling_status"),
        default=CaseHandlingStatus.AWAITING_ACTION,
        nullable=False,
        index=True,
    )
    verification_task: Mapped[CaseVerificationTask] = mapped_column(
        SAEnum(CaseVerificationTask, name="case_verification_task"),
        default=CaseVerificationTask.NONE,
        nullable=False,
        index=True,
    )
    confirmation_source: Mapped[Optional[str]] = mapped_column(String(280))
    confirmation_source_type: Mapped[Optional[str]] = mapped_column(String(80))
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    merged_into_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"), index=True)
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
    incident = relationship("Incident", back_populates="cases")
    share_links = relationship("CaseShareLink", back_populates="case")
    actions = relationship("CaseAction", back_populates="case")
    audit_entries = relationship("AuditLogEntry", back_populates="case")
    voice_intake = relationship("VoiceIntake", back_populates="case", uselist=False)
    case_reports = relationship("CaseReport", back_populates="case")
    merged_into_case = relationship("Case", remote_side=[id])
