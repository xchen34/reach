from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from app.models.enums import AttachmentModerationStatus
from app.schemas.common import ApiModel


class PublicAttachmentUploadItem(ApiModel):
    id: int
    original_filename: Optional[str] = None
    content_type: str
    byte_size: int


class PublicAttachmentUploadResponse(ApiModel):
    attachment_code: str
    max_images: int
    attachments: list[PublicAttachmentUploadItem]


class StaffAttachmentResponse(ApiModel):
    id: int
    report_id: Optional[int] = None
    case_id: Optional[int] = None
    attachment_code: str
    original_filename: Optional[str] = None
    content_type: str
    byte_size: int
    public_visibility: bool
    moderation_status: AttachmentModerationStatus
    created_at: datetime
    linked_at: Optional[datetime] = None


class StaffAttachmentUpdateRequest(ApiModel):
    public_visibility: Optional[bool] = None
    moderation_status: Optional[AttachmentModerationStatus] = None


class PublicBoardAttachment(ApiModel):
    id: int
    url: str
    content_type: str
    byte_size: int


AttachmentContentAccess = Literal["public", "staff"]
