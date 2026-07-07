from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import CaseActionType, CaseStatus


class CaseAction(Base):
    __tablename__ = "case_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), nullable=False, index=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    action_type: Mapped[CaseActionType] = mapped_column(
        SAEnum(CaseActionType, name="case_action_type"),
        nullable=False,
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    from_status: Mapped[Optional[CaseStatus]] = mapped_column(
        SAEnum(CaseStatus, name="case_status", create_type=False)
    )
    to_status: Mapped[Optional[CaseStatus]] = mapped_column(
        SAEnum(CaseStatus, name="case_status", create_type=False)
    )
    target_staff_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    case = relationship("Case", back_populates="actions")
    actor_user = relationship("User", foreign_keys=[actor_user_id], back_populates="case_actions")
    target_staff_user = relationship("User", foreign_keys=[target_staff_user_id])

