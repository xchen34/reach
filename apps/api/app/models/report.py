from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Index, JSON, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ReportSourceChannel, ReportTriageStatus, SubjectType


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_report_code", "report_code", unique=True),
        Index("ix_reports_triage_status", "triage_status"),
        Index("ix_reports_source_channel", "source_channel"),
        Index("ix_reports_received_at", "received_at"),
        Index("ix_reports_legacy_case_id", "legacy_case_id"),
        Index(
            "uq_reports_source_identity",
            "source_channel",
            "source_form_id",
            "source_entry_id",
            unique=True,
            sqlite_where=text("source_form_id IS NOT NULL AND source_entry_id IS NOT NULL"),
            postgresql_where=text("source_form_id IS NOT NULL AND source_entry_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False, index=True)
    intake_source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("incident_intake_sources.id"), index=True)
    report_code: Mapped[str] = mapped_column(String(24), nullable=False)
    source_channel: Mapped[ReportSourceChannel] = mapped_column(
        SAEnum(ReportSourceChannel, name="report_source_channel"),
        nullable=False,
    )
    source_form_id: Mapped[Optional[str]] = mapped_column(String(160))
    source_form_name: Mapped[Optional[str]] = mapped_column(String(160))
    source_entry_id: Mapped[Optional[str]] = mapped_column(String(160))
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    language_code: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    raw_answers_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    original_narrative: Mapped[str] = mapped_column(Text, nullable=False)
    location_text: Mapped[str] = mapped_column(String(280), nullable=False)
    reporter_name: Mapped[Optional[str]] = mapped_column(String(120))
    reporter_email: Mapped[Optional[str]] = mapped_column(String(320))
    reporter_phone: Mapped[Optional[str]] = mapped_column(String(40))
    reporter_relationship: Mapped[Optional[str]] = mapped_column(String(80))
    is_first_hand: Mapped[Optional[bool]] = mapped_column(Boolean)
    permission_to_contact: Mapped[Optional[bool]] = mapped_column(Boolean)
    subject_type: Mapped[SubjectType] = mapped_column(
        SAEnum(SubjectType, name="subject_type"),
        nullable=False,
        default=SubjectType.UNKNOWN,
    )
    media_refs_json: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSON)
    voice_intake_id: Mapped[Optional[int]] = mapped_column(ForeignKey("voice_intakes.id"), unique=True)
    triage_status: Mapped[ReportTriageStatus] = mapped_column(
        SAEnum(ReportTriageStatus, name="report_triage_status"),
        default=ReportTriageStatus.AWAITING_REVIEW,
        nullable=False,
    )
    triaged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    triaged_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    legacy_case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"))
    is_legacy_backfill: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    migration_note: Mapped[Optional[str]] = mapped_column(Text)
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

    case_link = relationship("CaseReport", back_populates="report", uselist=False)
    incident = relationship("Incident", back_populates="reports")
    intake_source = relationship("IncidentIntakeSource")
    triage_actions = relationship("ReportTriageAction", back_populates="report")
    voice_intake = relationship("VoiceIntake", back_populates="report", uselist=False)
    attachments = relationship("ReportAttachment", back_populates="report")
