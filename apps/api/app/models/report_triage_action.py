from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ReportTriageActionType, ReportTriageStatus


class ReportTriageAction(Base):
    __tablename__ = "report_triage_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), nullable=False, index=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    action_type: Mapped[ReportTriageActionType] = mapped_column(
        SAEnum(ReportTriageActionType, name="report_triage_action_type"),
        nullable=False,
    )
    from_status: Mapped[Optional[ReportTriageStatus]] = mapped_column(
        SAEnum(ReportTriageStatus, name="report_triage_status", create_type=False)
    )
    to_status: Mapped[Optional[ReportTriageStatus]] = mapped_column(
        SAEnum(ReportTriageStatus, name="report_triage_status", create_type=False)
    )
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"), index=True)
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    report = relationship("Report", back_populates="triage_actions")
