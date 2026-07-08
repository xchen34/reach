from __future__ import annotations

import mimetypes
from pathlib import Path
from uuid import uuid4

from app.config import get_settings


class LocalVoiceStorage:
    def __init__(self) -> None:
        self.root = Path(get_settings().voice_storage_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def create_storage_key(self, content_type: str) -> str:
        extension = mimetypes.guess_extension(content_type) or ".bin"
        return f"{uuid4().hex}{extension}"

    def write_bytes(self, storage_key: str, payload: bytes) -> Path:
        destination = self.root / storage_key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
        return destination

    def path_for(self, storage_key: str) -> Path:
        return self.root / storage_key

    def exists(self, storage_key: str) -> bool:
        return self.path_for(storage_key).exists()
