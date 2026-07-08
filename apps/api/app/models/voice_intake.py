from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import VoiceProcessingStatus, VoiceRetentionState, VoiceTranscriptState


class VoiceIntake(Base):
    __tablename__ = "voice_intakes"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    case_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cases.id"), unique=True)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    processing_status: Mapped[VoiceProcessingStatus] = mapped_column(
        SAEnum(VoiceProcessingStatus, name="voice_processing_status"),
        default=VoiceProcessingStatus.PENDING,
        nullable=False,
    )
    transcription_text: Mapped[Optional[str]] = mapped_column(Text)
    transcription_language_code: Mapped[Optional[str]] = mapped_column(String(8))
    transcription_confidence: Mapped[Optional[float]] = mapped_column(Float)
    confirmed_transcript_text: Mapped[Optional[str]] = mapped_column(Text)
    transcript_state: Mapped[VoiceTranscriptState] = mapped_column(
        SAEnum(VoiceTranscriptState, name="voice_transcript_state"),
        default=VoiceTranscriptState.GENERATED,
        nullable=False,
    )
    retention_state: Mapped[VoiceRetentionState] = mapped_column(
        SAEnum(VoiceRetentionState, name="voice_retention_state"),
        default=VoiceRetentionState.RETAINED,
        nullable=False,
    )
    attached_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
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

    case = relationship("Case", back_populates="voice_intake")
