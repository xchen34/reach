from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import IncidentStatus


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        Index("ix_incidents_slug", "slug", unique=True),
        Index("ix_incidents_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    internal_name: Mapped[str] = mapped_column(String(160), nullable=False)
    public_name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    disaster_type: Mapped[str] = mapped_column(String(80), nullable=False)
    affected_area: Mapped[str] = mapped_column(String(280), nullable=False)
    incident_start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    public_description: Mapped[Optional[str]] = mapped_column(Text)
    supported_languages: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[IncidentStatus] = mapped_column(
        SAEnum(IncidentStatus, name="incident_status"),
        default=IncidentStatus.DRAFT,
        nullable=False,
    )
    form_opening_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    form_closing_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    owning_team: Mapped[Optional[str]] = mapped_column(String(160))
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

    intake_sources = relationship("IncidentIntakeSource", back_populates="incident")
    reports = relationship("Report", back_populates="incident")
    cases = relationship("Case", back_populates="incident")
