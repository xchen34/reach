from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

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


class SpeechToTextConfigurationError(ValueError):
    pass


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


class OpenAICompatibleSpeechToTextProvider(SpeechToTextProvider):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        if not model.strip():
            raise SpeechToTextConfigurationError(
                "speech_to_text_provider 'openai_compatible' requires BEACON_SPEECH_TO_TEXT_OPENAI_MODEL."
            )

        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def transcribe(
        self,
        *,
        file_path: Path,
        content_type: str,
        language_hint: Optional[str],
    ) -> SpeechToTextResult:
        response = httpx.post(
            f"{self.base_url}/audio/transcriptions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
            },
            data=self._request_data(language_hint),
            files={
                "file": (file_path.name, file_path.read_bytes(), content_type),
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        transcription_text = payload.get("text")
        if not isinstance(transcription_text, str) or not transcription_text.strip():
            raise ValueError("Speech-to-text provider returned an invalid transcription payload.")

        language_code = payload.get("language")
        confidence = payload.get("confidence")
        return SpeechToTextResult(
            transcription_text=transcription_text.strip(),
            language_code=language_code if isinstance(language_code, str) else language_hint,
            confidence=confidence if isinstance(confidence, (int, float)) else None,
        )

    def _request_data(self, language_hint: Optional[str]) -> dict[str, str]:
        data = {
            "model": self.model,
        }
        if language_hint:
            data["language"] = language_hint
        return data


def get_speech_to_text_provider() -> SpeechToTextProvider:
    settings = get_settings()
    provider_name = settings.speech_to_text_provider.strip().lower()
    if provider_name == "development_stub":
        return DevelopmentStubSpeechToTextProvider()
    if provider_name == "openai_compatible":
        if not (settings.speech_to_text_openai_api_key or "").strip():
            return DevelopmentStubSpeechToTextProvider()
        return OpenAICompatibleSpeechToTextProvider(
            base_url=settings.speech_to_text_openai_base_url,
            api_key=settings.speech_to_text_openai_api_key or "",
            model=settings.speech_to_text_openai_model,
            timeout_seconds=settings.speech_to_text_timeout_seconds,
        )
    raise SpeechToTextConfigurationError(f"Unsupported speech_to_text_provider: {provider_name}")
