from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.deps import StaffSessionContext, get_db, require_staff_session
from app.schemas.attachment import (
    PublicAttachmentUploadResponse,
    StaffAttachmentResponse,
    StaffAttachmentUpdateRequest,
)
from app.schemas.common import ErrorResponse
from app.services.report_attachment_service import ReportAttachmentService


router = APIRouter(tags=["attachments"])
staff_router = APIRouter(prefix="/staff", tags=["staff-attachments"])


@router.post(
    "/public/incidents/{incident_slug}/attachments",
    response_model=PublicAttachmentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Image validation failed."},
        404: {"model": ErrorResponse, "description": "Incident not found."},
        413: {"model": ErrorResponse, "description": "Image file exceeded the configured size limit."},
    },
)
async def upload_public_incident_attachments(
    incident_slug: str,
    images: Annotated[list[UploadFile], File(...)],
    db: Session = Depends(get_db),
) -> PublicAttachmentUploadResponse:
    files = []
    for image in images:
        files.append((image.filename, image.content_type, await image.read()))
    try:
        return ReportAttachmentService(db).create_public_uploads(incident_slug=incident_slug, files=files)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except OverflowError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/public/attachments/{attachment_id}/content",
    response_class=FileResponse,
    include_in_schema=False,
)
def get_public_attachment_content(
    attachment_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        access = ReportAttachmentService(db).open_public_attachment(attachment_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(access.file_path, media_type=access.content_type, filename=access.file_name)


@staff_router.get(
    "/reports/{report_id}/attachments",
    response_model=list[StaffAttachmentResponse],
    responses={401: {"model": ErrorResponse, "description": "Missing, expired, revoked, or invalid bearer session."}},
)
def list_staff_report_attachments(
    report_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> list[StaffAttachmentResponse]:
    return ReportAttachmentService(db).list_report_attachments(report_id)


@staff_router.patch(
    "/attachments/{attachment_id}",
    response_model=StaffAttachmentResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing, expired, revoked, or invalid bearer session."},
        404: {"model": ErrorResponse, "description": "Attachment not found."},
    },
)
def update_staff_attachment(
    attachment_id: int,
    payload: StaffAttachmentUpdateRequest,
    db: Session = Depends(get_db),
    session_context: StaffSessionContext = Depends(require_staff_session),
) -> StaffAttachmentResponse:
    try:
        return ReportAttachmentService(db).update_staff_attachment(
            attachment_id=attachment_id,
            actor=session_context.user,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@staff_router.get(
    "/attachments/{attachment_id}/content",
    response_class=FileResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing, expired, revoked, or invalid bearer session."},
        404: {"model": ErrorResponse, "description": "Attachment not found."},
    },
)
def get_staff_attachment_content(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> Response:
    try:
        access = ReportAttachmentService(db).open_staff_attachment(attachment_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(access.file_path, media_type=access.content_type, filename=access.file_name)
