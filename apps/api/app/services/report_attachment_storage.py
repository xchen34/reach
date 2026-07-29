from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.config import get_settings


CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class LocalReportAttachmentStorage:
    def __init__(self) -> None:
        self.root = Path(get_settings().report_attachment_storage_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def create_storage_key(self, content_type: str) -> str:
        extension = CONTENT_TYPE_EXTENSIONS[content_type]
        return f"{uuid4().hex}{extension}"

    def write_bytes(self, storage_key: str, payload: bytes) -> Path:
        destination = self.path_for(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
        return destination

    def path_for(self, storage_key: str) -> Path:
        candidate = (self.root / storage_key).resolve()
        root = self.root.resolve()
        if root not in candidate.parents and candidate != root:
            raise ValueError("Invalid attachment storage key.")
        return candidate

    def exists(self, storage_key: str) -> bool:
        return self.path_for(storage_key).exists()
