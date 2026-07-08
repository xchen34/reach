from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.config import get_settings


@dataclass
class SpeechToTextResult:
    transcription_text: str
    language_code: Optional[str] = None
    confidence: Optional[float] = None


class SpeechToTextProvider(ABC):
    @abstractmethod
    def transcribe(
        self,
        *,
        file_path: Path,
        content_type: str,
        language_hint: Optional[str],
    ) -> SpeechToTextResult:
        raise NotImplementedError


class DevelopmentStubSpeechToTextProvider(SpeechToTextProvider):
    def transcribe(
        self,
        *,
        file_path: Path,
        content_type: str,
        language_hint: Optional[str],
    ) -> SpeechToTextResult:
        return SpeechToTextResult(
            transcription_text="Audio received. Review and edit this transcript before submitting.",
            language_code=language_hint,
            confidence=None,
        )


def get_speech_to_text_provider() -> SpeechToTextProvider:
    provider_name = get_settings().speech_to_text_provider
    if provider_name == "development_stub":
        return DevelopmentStubSpeechToTextProvider()
    raise ValueError(f"Unsupported speech_to_text_provider: {provider_name}")
