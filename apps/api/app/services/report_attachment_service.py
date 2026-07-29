from __future__ import annotations

import secrets
import string
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.enums import (
    AttachmentModerationStatus,
    AuditActorType,
    AuditEventType,
)
from app.models.incident import Incident
from app.models.report import Report
from app.models.report_attachment import ReportAttachment
from app.schemas.attachment import (
    PublicAttachmentUploadItem,
    PublicAttachmentUploadResponse,
    PublicBoardAttachment,
    StaffAttachmentResponse,
    StaffAttachmentUpdateRequest,
)
from app.schemas.staff import StaffUserSummary
from app.services.report_attachment_storage import LocalReportAttachmentStorage


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


@dataclass(frozen=True)
class AttachmentContent:
    file_path: Path
    content_type: str
    file_name: str


class ReportAttachmentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.storage = LocalReportAttachmentStorage()

    def create_public_uploads(
        self,
        *,
        incident_slug: str,
        files: list[tuple[str | None, str | None, bytes]],
    ) -> PublicAttachmentUploadResponse:
        incident = self.db.scalar(select(Incident).where(Incident.slug == incident_slug))
        if incident is None:
            raise LookupError("Incident not found.")
        if not files:
            raise ValueError("At least one image is required.")
        if len(files) > self.settings.report_attachment_max_files:
            raise ValueError(f"Upload at most {self.settings.report_attachment_max_files} images.")

        attachment_code = self._generate_attachment_code()
        attachments: list[ReportAttachment] = []
        for original_filename, declared_content_type, content in files:
            content_type = self._validate_image(content, declared_content_type)
            storage_key = self.storage.create_storage_key(content_type)
            self.storage.write_bytes(storage_key, content)
            attachment = ReportAttachment(
                incident_id=incident.id,
                attachment_code=attachment_code,
                storage_key=storage_key,
                original_filename=self._safe_filename(original_filename),
                content_type=content_type,
                byte_size=len(content),
                public_visibility=False,
                moderation_status=AttachmentModerationStatus.PENDING,
            )
            self.db.add(attachment)
            attachments.append(attachment)

        self.db.flush()
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.ANONYMOUS,
                event_type=AuditEventType.REPORT_RECEIVED,
                metadata_json={
                    "incident_id": incident.id,
                    "attachment_code": attachment_code,
                    "attachment_count": len(attachments),
                    "source": "public_attachment_upload",
                },
            )
        )
        self.db.commit()
        for attachment in attachments:
            self.db.refresh(attachment)

        return PublicAttachmentUploadResponse(
            attachment_code=attachment_code,
            max_images=self.settings.report_attachment_max_files,
            attachments=[self._to_public_upload_item(attachment) for attachment in attachments],
        )

    def link_code_to_report(self, *, incident_id: int, report_id: int, attachment_code: str | None) -> list[str]:
        code = self.normalize_attachment_code(attachment_code)
        if code is None:
            return []

        attachments = self.db.scalars(
            select(ReportAttachment).where(
                ReportAttachment.incident_id == incident_id,
                ReportAttachment.attachment_code == code,
            )
        ).all()
        if not attachments:
            return [f"Unknown Reach photo attachment code: {code}"]

        linked_count = 0
        now = datetime.now(timezone.utc)
        for attachment in attachments:
            if attachment.report_id is not None and attachment.report_id != report_id:
                continue
            if attachment.report_id is None:
                attachment.report_id = report_id
                attachment.linked_at = now
                linked_count += 1
        if linked_count:
            self.db.add(
                AuditLogEntry(
                    actor_type=AuditActorType.SYSTEM,
                    event_type=AuditEventType.REPORT_RECEIVED,
                    metadata_json={
                        "report_id": report_id,
                        "attachment_code": code,
                        "linked_attachment_count": linked_count,
                    },
                )
            )
        return []

    def link_report_attachments_to_case(self, *, report_id: int, case_id: int) -> None:
        attachments = self.db.scalars(
            select(ReportAttachment).where(ReportAttachment.report_id == report_id)
        ).all()
        now = datetime.now(timezone.utc)
        for attachment in attachments:
            if attachment.case_id is None:
                attachment.case_id = case_id
                attachment.linked_at = attachment.linked_at or now

    def list_report_attachments(self, report_id: int) -> list[StaffAttachmentResponse]:
        attachments = self.db.scalars(
            select(ReportAttachment)
            .where(ReportAttachment.report_id == report_id)
            .order_by(ReportAttachment.created_at.asc(), ReportAttachment.id.asc())
        ).all()
        return [self._to_staff_attachment(attachment) for attachment in attachments]

    def list_case_attachments(self, case_id: int) -> list[StaffAttachmentResponse]:
        attachments = self.db.scalars(
            select(ReportAttachment)
            .where(ReportAttachment.case_id == case_id)
            .order_by(ReportAttachment.created_at.asc(), ReportAttachment.id.asc())
        ).all()
        return [self._to_staff_attachment(attachment) for attachment in attachments]

    def update_staff_attachment(
        self,
        *,
        attachment_id: int,
        actor: StaffUserSummary,
        payload: StaffAttachmentUpdateRequest,
    ) -> StaffAttachmentResponse:
        attachment = self.db.get(ReportAttachment, attachment_id)
        if attachment is None:
            raise LookupError("Attachment not found.")
        if payload.public_visibility is not None:
            attachment.public_visibility = payload.public_visibility
        if payload.moderation_status is not None:
            attachment.moderation_status = payload.moderation_status
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                case_id=attachment.case_id,
                event_type=AuditEventType.CASE_ACTION_CREATED,
                metadata_json={
                    "action_type": "attachment_moderation",
                    "attachment_id": attachment.id,
                    "public_visibility": attachment.public_visibility,
                    "moderation_status": attachment.moderation_status.value,
                },
            )
        )
        self.db.commit()
        self.db.refresh(attachment)
        return self._to_staff_attachment(attachment)

    def open_staff_attachment(self, attachment_id: int) -> AttachmentContent:
        attachment = self.db.get(ReportAttachment, attachment_id)
        if attachment is None or not self.storage.exists(attachment.storage_key):
            raise LookupError("Attachment not found.")
        return AttachmentContent(
            file_path=self.storage.path_for(attachment.storage_key),
            content_type=attachment.content_type,
            file_name=f"reach-report-attachment-{attachment.id}{Path(attachment.storage_key).suffix}",
        )

    def open_public_attachment(self, attachment_id: int) -> AttachmentContent:
        attachment = self.db.get(ReportAttachment, attachment_id)
        if (
            attachment is None
            or not attachment.public_visibility
            or attachment.moderation_status != AttachmentModerationStatus.APPROVED
            or not self.storage.exists(attachment.storage_key)
        ):
            raise LookupError("Attachment not found.")
        return AttachmentContent(
            file_path=self.storage.path_for(attachment.storage_key),
            content_type=attachment.content_type,
            file_name=f"reach-public-attachment-{attachment.id}{Path(attachment.storage_key).suffix}",
        )

    def first_public_board_attachment(self, case: Case) -> PublicBoardAttachment | None:
        attachment = next(
            (
                item
                for item in sorted(case.attachments or [], key=lambda value: (value.created_at, value.id))
                if item.public_visibility and item.moderation_status == AttachmentModerationStatus.APPROVED
            ),
            None,
        )
        if attachment is None:
            return None
        return PublicBoardAttachment(
            id=attachment.id,
            url=f"/public/attachments/{attachment.id}/content",
            content_type=attachment.content_type,
            byte_size=attachment.byte_size,
        )

    @staticmethod
    def normalize_attachment_code(value: str | None) -> str | None:
        code = "".join(ch for ch in str(value or "").upper() if ch.isalnum())
        return code or None

    def _validate_image(self, content: bytes, declared_content_type: str | None) -> str:
        if not content:
            raise ValueError("Image upload is empty.")
        if len(content) > self.settings.report_attachment_max_upload_bytes:
            raise OverflowError("Image file exceeds the size limit.")

        actual = self._detect_image_type(content)
        if actual not in ALLOWED_IMAGE_TYPES:
            raise ValueError("Only JPEG, PNG, and WebP images are accepted.")

        declared = (declared_content_type or "").split(";", maxsplit=1)[0].strip().lower()
        if declared and declared not in {"application/octet-stream", actual}:
            raise ValueError("Declared content type does not match the uploaded image.")
        return actual

    @staticmethod
    def _detect_image_type(content: bytes) -> str | None:
        if content.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
            return "image/webp"
        return None

    @staticmethod
    def _safe_filename(value: str | None) -> str | None:
        if not value:
            return None
        name = Path(value).name.strip()
        return name[:255] or None

    @staticmethod
    def _to_public_upload_item(attachment: ReportAttachment) -> PublicAttachmentUploadItem:
        return PublicAttachmentUploadItem(
            id=attachment.id,
            original_filename=attachment.original_filename,
            content_type=attachment.content_type,
            byte_size=attachment.byte_size,
        )

    @staticmethod
    def _to_staff_attachment(attachment: ReportAttachment) -> StaffAttachmentResponse:
        return StaffAttachmentResponse.model_validate(attachment)

    @staticmethod
    def _generate_attachment_code(length: int = 6) -> str:
        alphabet = string.ascii_uppercase + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))
