from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.audit_log_entry import AuditLogEntry
from app.models.enums import (
    AuditActorType,
    AuditEventType,
    VoiceProcessingStatus,
    VoiceRetentionState,
    VoiceTranscriptState,
)
from app.models.voice_intake import VoiceIntake
from app.schemas.staff import StaffUserSummary
from app.schemas.voice import StaffCaseVoiceResponse, VoiceIntakeCreateResponse, VoiceIntakeView
from app.services.speech_to_text import get_speech_to_text_provider
from app.services.voice_storage import LocalVoiceStorage


ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/m4a",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
}


@dataclass
class VoiceAudioAccess:
    file_path: Path
    content_type: str
    file_name: str


class VoiceIntakeService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.storage = LocalVoiceStorage()
        self.provider = get_speech_to_text_provider()

    def create_voice_intake(
        self,
        *,
        content: bytes,
        content_type: Optional[str],
        language_code: Optional[str],
        duration_seconds: Optional[float],
    ) -> VoiceIntakeCreateResponse:
        resolved_content_type = self._validate_content_type(content_type)
        self._validate_content_size(content)

        voice_token = secrets.token_urlsafe(24)
        storage_key = self.storage.create_storage_key(resolved_content_type)
        file_path = self.storage.write_bytes(storage_key, content)

        intake = VoiceIntake(
            public_token_hash=self._hash_token(voice_token),
            storage_key=storage_key,
            content_type=resolved_content_type,
            size_bytes=len(content),
            duration_seconds=duration_seconds,
            processing_status=VoiceProcessingStatus.PENDING,
            transcript_state=VoiceTranscriptState.GENERATED,
            retention_state=VoiceRetentionState.RETAINED,
        )
        self.db.add(intake)
        self.db.flush()

        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                event_type=AuditEventType.VOICE_INTAKE_UPLOADED,
                metadata_json={"voice_intake_id": intake.id},
            )
        )

        try:
            transcription = self.provider.transcribe(
                file_path=file_path,
                content_type=resolved_content_type,
                language_hint=language_code,
            )
            intake.processing_status = VoiceProcessingStatus.COMPLETED
            intake.transcription_text = transcription.transcription_text
            intake.transcription_language_code = transcription.language_code
            intake.transcription_confidence = transcription.confidence
        except Exception:
            intake.processing_status = VoiceProcessingStatus.FAILED

        self.db.commit()
        self.db.refresh(intake)
        return self._to_public_response(intake, voice_token)

    def retrieve_voice_intake(self, voice_intake_token: str) -> VoiceIntakeView:
        intake = self._get_public_intake(voice_intake_token)
        return self._to_public_view(intake)

    def confirm_transcript(
        self,
        *,
        voice_intake_token: str,
        confirmed_transcript_text: str,
    ) -> VoiceIntakeView:
        intake = self._get_public_intake(voice_intake_token)
        if intake.processing_status != VoiceProcessingStatus.COMPLETED or intake.transcription_text is None:
            raise ValueError("Transcription is not available.")

        normalized = confirmed_transcript_text.strip()
        if not normalized:
            raise ValueError("Confirmed transcript text is required.")

        intake.confirmed_transcript_text = normalized
        intake.transcript_state = (
            VoiceTranscriptState.CONFIRMED
            if normalized == intake.transcription_text.strip()
            else VoiceTranscriptState.EDITED
        )
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                event_type=AuditEventType.VOICE_TRANSCRIPT_CONFIRMED,
                metadata_json={
                    "voice_intake_id": intake.id,
                    "transcript_state": intake.transcript_state.value,
                },
            )
        )
        self.db.commit()
        self.db.refresh(intake)
        return self._to_public_view(intake)

    def attach_confirmed_voice_to_case(self, *, case_id: int, voice_intake_token: str) -> VoiceIntake:
        intake = self._get_intake_by_token(voice_intake_token)
        if intake is None or intake.retention_state == VoiceRetentionState.DELETED:
            raise ValueError("Voice intake is unavailable.")
        if intake.case_id is not None:
            raise ValueError("Voice intake is unavailable.")
        if intake.processing_status != VoiceProcessingStatus.COMPLETED:
            raise ValueError("Voice transcription is not ready.")
        if intake.confirmed_transcript_text is None:
            raise ValueError("Voice transcript must be confirmed before case submission.")

        intake.case_id = case_id
        intake.attached_at = datetime.now(timezone.utc)
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                case_id=case_id,
                event_type=AuditEventType.VOICE_TRANSCRIPT_ATTACHED,
                metadata_json={
                    "voice_intake_id": intake.id,
                    "transcript_state": intake.transcript_state.value,
                },
            )
        )
        self.db.flush()
        return intake

    def get_staff_case_voice(self, case_id: int) -> Optional[StaffCaseVoiceResponse]:
        intake = self.db.scalar(select(VoiceIntake).where(VoiceIntake.case_id == case_id))
        if intake is None:
            return None
        return self._to_staff_view(intake)

    def open_staff_case_audio(self, *, case_id: int, actor: StaffUserSummary) -> VoiceAudioAccess:
        intake = self.db.scalar(select(VoiceIntake).where(VoiceIntake.case_id == case_id))
        if intake is None or intake.retention_state == VoiceRetentionState.DELETED:
            raise LookupError("Voice audio not found.")
        if not self.storage.exists(intake.storage_key):
            raise LookupError("Voice audio not found.")

        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=case_id,
                event_type=AuditEventType.STAFF_VOICE_AUDIO_ACCESSED,
                metadata_json={"voice_intake_id": intake.id},
            )
        )
        self.db.commit()
        return VoiceAudioAccess(
            file_path=self.storage.path_for(intake.storage_key),
            content_type=intake.content_type,
            file_name=f"voice-intake-{intake.id}{self.storage.path_for(intake.storage_key).suffix}",
        )

    def _get_public_intake(self, voice_intake_token: str) -> VoiceIntake:
        intake = self._get_intake_by_token(voice_intake_token)
        if intake is None or intake.retention_state == VoiceRetentionState.DELETED or intake.case_id is not None:
            raise LookupError("Voice intake not found.")
        return intake

    def _get_intake_by_token(self, voice_intake_token: str) -> Optional[VoiceIntake]:
        return self.db.scalar(
            select(VoiceIntake).where(VoiceIntake.public_token_hash == self._hash_token(voice_intake_token))
        )

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _validate_content_type(content_type: Optional[str]) -> str:
        if content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
            raise ValueError("Unsupported audio format.")
        return content_type

    def _validate_content_size(self, content: bytes) -> None:
        if not content:
            raise ValueError("Audio upload is empty.")
        max_bytes = get_settings().voice_max_upload_bytes
        if len(content) > max_bytes:
            raise OverflowError("Audio file exceeds the size limit.")

    @staticmethod
    def _to_public_response(intake: VoiceIntake, voice_intake_token: str) -> VoiceIntakeCreateResponse:
        return VoiceIntakeCreateResponse(
            voice_intake_token=voice_intake_token,
            **VoiceIntakeService._to_public_view(intake).model_dump(),
        )

    @staticmethod
    def _to_public_view(intake: VoiceIntake) -> VoiceIntakeView:
        return VoiceIntakeView(
            id=intake.id,
            processing_status=intake.processing_status,
            content_type=intake.content_type,
            size_bytes=intake.size_bytes,
            duration_seconds=intake.duration_seconds,
            transcription_text=intake.transcription_text,
            transcription_language_code=intake.transcription_language_code,
            transcription_confidence=intake.transcription_confidence,
            confirmed_transcript_text=intake.confirmed_transcript_text,
            transcript_state=intake.transcript_state,
            retention_state=intake.retention_state,
            attached_to_case=intake.case_id is not None,
            created_at=intake.created_at,
            updated_at=intake.updated_at,
        )

    def _to_staff_view(self, intake: VoiceIntake) -> StaffCaseVoiceResponse:
        assert intake.case_id is not None
        return StaffCaseVoiceResponse(
            id=intake.id,
            case_id=intake.case_id,
            processing_status=intake.processing_status,
            content_type=intake.content_type,
            size_bytes=intake.size_bytes,
            duration_seconds=intake.duration_seconds,
            transcription_text=intake.transcription_text,
            transcription_language_code=intake.transcription_language_code,
            transcription_confidence=intake.transcription_confidence,
            confirmed_transcript_text=intake.confirmed_transcript_text,
            transcript_state=intake.transcript_state,
            retention_state=intake.retention_state,
            audio_available=intake.retention_state == VoiceRetentionState.RETAINED and self.storage.exists(intake.storage_key),
            created_at=intake.created_at,
            updated_at=intake.updated_at,
        )
