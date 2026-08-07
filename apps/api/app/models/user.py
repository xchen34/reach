from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import StaffRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    role: Mapped[StaffRole] = mapped_column(
        SAEnum(StaffRole, name="staff_role"),
        default=StaffRole.VOLUNTEER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
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

    magic_link_tokens = relationship("MagicLinkToken", back_populates="user")
    staff_sessions = relationship("StaffSession", back_populates="user")
    assigned_cases = relationship(
        "Case",
        back_populates="assigned_staff_user",
        foreign_keys="Case.assigned_staff_user_id",
    )
    created_share_links = relationship("CaseShareLink", back_populates="created_by_user")
    case_actions = relationship(
        "CaseAction",
        foreign_keys="CaseAction.actor_user_id",
        back_populates="actor_user",
    )
    audit_entries = relationship("AuditLogEntry", back_populates="actor_user")
