from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.enums import VoiceProcessingStatus, VoiceRetentionState, VoiceTranscriptState
from app.schemas.common import ApiModel


class VoiceIntakeRetrieveRequest(BaseModel):
    voice_intake_token: str = Field(min_length=16)


class VoiceTranscriptConfirmRequest(VoiceIntakeRetrieveRequest):
    confirmed_transcript_text: str = Field(min_length=1, max_length=4000)


class VoiceIntakeView(ApiModel):
    id: int
    processing_status: VoiceProcessingStatus
    content_type: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    transcription_text: Optional[str] = None
    transcription_language_code: Optional[str] = None
    transcription_confidence: Optional[float] = None
    confirmed_transcript_text: Optional[str] = None
    transcript_state: VoiceTranscriptState
    retention_state: VoiceRetentionState
    attached_to_case: bool
    created_at: datetime
    updated_at: datetime


class VoiceIntakeCreateResponse(VoiceIntakeView):
    voice_intake_token: str


class StaffCaseVoiceResponse(ApiModel):
    id: int
    case_id: int
    processing_status: VoiceProcessingStatus
    content_type: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    transcription_text: Optional[str] = None
    transcription_language_code: Optional[str] = None
    transcription_confidence: Optional[float] = None
    confirmed_transcript_text: Optional[str] = None
    transcript_state: VoiceTranscriptState
    retention_state: VoiceRetentionState
    audio_available: bool
    created_at: datetime
    updated_at: datetime


class VoiceIntakeUploadForm(BaseModel):
    language_code: Optional[str] = Field(default=None, min_length=2, max_length=8)
    duration_seconds: Optional[float] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def normalize_language_code(self) -> "VoiceIntakeUploadForm":
        if self.language_code is not None:
            self.language_code = self.language_code.strip().lower() or None
        return self
