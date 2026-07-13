from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CaseReport(Base):
    __tablename__ = "case_reports"
    __table_args__ = (
        UniqueConstraint("case_id", "report_id", name="uq_case_reports_case_report"),
        UniqueConstraint("report_id", name="uq_case_reports_report_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), nullable=False, index=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), nullable=False, index=True)
    linked_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    link_reason: Mapped[Optional[str]] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    case = relationship("Case", back_populates="case_reports")
    report = relationship("Report", back_populates="case_link")
