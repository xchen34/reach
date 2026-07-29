from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import AttachmentModerationStatus


class ReportAttachment(Base):
    __tablename__ = "report_attachments"
    __table_args__ = (
        Index("ix_report_attachments_attachment_code", "attachment_code"),
        Index("ix_report_attachments_report_id", "report_id"),
        Index("ix_report_attachments_incident_id", "incident_id"),
        Index("ix_report_attachments_case_id", "case_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[Optional[int]] = mapped_column(ForeignKey("reports.id"), nullable=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False)
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"), nullable=True)
    attachment_code: Mapped[str] = mapped_column(String(24), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    public_visibility: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    moderation_status: Mapped[AttachmentModerationStatus] = mapped_column(
        SAEnum(AttachmentModerationStatus, name="attachment_moderation_status"),
        nullable=False,
        default=AttachmentModerationStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    linked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    report = relationship("Report", back_populates="attachments")
    case = relationship("Case", back_populates="attachments")
