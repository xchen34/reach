from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import IntakeSourceType


class IncidentIntakeSource(Base):
    __tablename__ = "incident_intake_sources"
    __table_args__ = (
        Index("ix_incident_intake_sources_incident_id", "incident_id"),
        Index("ix_incident_intake_sources_google_form_id", "google_form_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), nullable=False)
    source_type: Mapped[IntakeSourceType] = mapped_column(
        SAEnum(IntakeSourceType, name="intake_source_type"),
        default=IntakeSourceType.GOOGLE_SHEETS,
        nullable=False,
    )
    google_form_url: Mapped[str] = mapped_column(String(1200), nullable=False)
    google_form_id: Mapped[Optional[str]] = mapped_column(String(200))
    google_spreadsheet_id: Mapped[str] = mapped_column(String(200), nullable=False)
    google_sheet_name: Mapped[str] = mapped_column(String(200), nullable=False, default="Form Responses 1")
    last_imported_row: Mapped[int] = mapped_column(nullable=False, default=1)
    # When the sheet was last pulled. Distinct from updated_at, which moves for
    # any edit to this row.
    last_imported_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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

    incident = relationship("Incident", back_populates="intake_sources")
