from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.config import get_settings
from app.services.speech_to_text import (
    DevelopmentStubSpeechToTextProvider,
    OpenAICompatibleSpeechToTextProvider,
    SpeechToTextConfigurationError,
    get_speech_to_text_provider,
)


@pytest.fixture(autouse=True)
def reset_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_get_speech_to_text_provider_defaults_to_development_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BEACON_SPEECH_TO_TEXT_PROVIDER", raising=False)

    provider = get_speech_to_text_provider()

    assert isinstance(provider, DevelopmentStubSpeechToTextProvider)


def test_get_speech_to_text_provider_returns_openai_compatible_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_PROVIDER", "openai_compatible")
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_OPENAI_MODEL", "demo-transcribe")
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_OPENAI_BASE_URL", "https://stt.example/v1/")
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_TIMEOUT_SECONDS", "12.5")

    provider = get_speech_to_text_provider()

    assert isinstance(provider, OpenAICompatibleSpeechToTextProvider)
    assert provider.base_url == "https://stt.example/v1"
    assert provider.model == "demo-transcribe"
    assert provider.timeout_seconds == 12.5


def test_get_speech_to_text_provider_falls_back_to_stub_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_PROVIDER", "openai_compatible")
    monkeypatch.delenv("BEACON_SPEECH_TO_TEXT_OPENAI_API_KEY", raising=False)

    provider = get_speech_to_text_provider()

    assert isinstance(provider, DevelopmentStubSpeechToTextProvider)


def test_get_speech_to_text_provider_rejects_unsupported_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BEACON_SPEECH_TO_TEXT_PROVIDER", "unknown_provider")

    with pytest.raises(SpeechToTextConfigurationError) as exc_info:
        get_speech_to_text_provider()

    assert "Unsupported speech_to_text_provider" in str(exc_info.value)


def test_openai_compatible_provider_transcribe_posts_audio_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "sample.wav"
    audio_path.write_bytes(b"RIFFdemo")
    captured: dict[str, object] = {}

    def fake_post(
        url: str,
        *,
        headers: dict[str, str],
        data: dict[str, str],
        files: dict[str, tuple[str, bytes, str]],
        timeout: float,
    ) -> httpx.Response:
        captured["url"] = url
        captured["headers"] = headers
        captured["data"] = data
        captured["files"] = files
        captured["timeout"] = timeout
        request = httpx.Request("POST", url)
        return httpx.Response(
            status_code=200,
            json={
                "text": "Caller reports smoke in the building.",
                "language": "en",
                "confidence": 0.91,
            },
            request=request,
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICompatibleSpeechToTextProvider(
        base_url="https://stt.example/v1",
        api_key="test-key",
        model="demo-transcribe",
        timeout_seconds=9.0,
    )

    result = provider.transcribe(
        file_path=audio_path,
        content_type="audio/wav",
        language_hint="en",
    )

    assert result.transcription_text == "Caller reports smoke in the building."
    assert result.language_code == "en"
    assert result.confidence == 0.91
    assert captured["url"] == "https://stt.example/v1/audio/transcriptions"
    assert captured["headers"] == {"Authorization": "Bearer test-key"}
    assert captured["data"] == {"model": "demo-transcribe", "language": "en"}
    assert captured["files"] == {"file": ("sample.wav", b"RIFFdemo", "audio/wav")}
    assert captured["timeout"] == 9.0
