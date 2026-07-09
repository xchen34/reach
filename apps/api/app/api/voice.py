from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.deps import StaffSessionContext, get_db, require_staff_session
from app.schemas.common import ErrorResponse
from app.schemas.voice import (
    StaffCaseVoiceResponse,
    VoiceIntakeCreateResponse,
    VoiceIntakeRetrieveRequest,
    VoiceIntakeUploadForm,
    VoiceIntakeView,
    VoiceTranscriptConfirmRequest,
)
from app.services.voice_intake import VoiceIntakeService


router = APIRouter(tags=["voice"])
staff_router = APIRouter(prefix="/staff/cases", tags=["staff-voice"])


@router.post(
    "/voice-intakes",
    response_model=VoiceIntakeCreateResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Audio validation failed."},
        413: {"model": ErrorResponse, "description": "Audio file exceeded the configured size limit."},
    },
)
async def upload_voice_intake(
    audio_file: UploadFile = File(...),
    language_code: Optional[str] = Form(default=None),
    duration_seconds: Optional[float] = Form(default=None),
    db: Session = Depends(get_db),
) -> VoiceIntakeCreateResponse:
    form = VoiceIntakeUploadForm(language_code=language_code, duration_seconds=duration_seconds)
    content = await audio_file.read()
    service = VoiceIntakeService(db)
    try:
        return service.create_voice_intake(
            content=content,
            content_type=audio_file.content_type,
            file_name=audio_file.filename,
            language_code=form.language_code,
            duration_seconds=form.duration_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OverflowError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc


@router.post(
    "/voice-intakes/retrieve",
    response_model=VoiceIntakeView,
    responses={404: {"model": ErrorResponse, "description": "Voice intake not found."}},
)
def retrieve_voice_intake(
    payload: VoiceIntakeRetrieveRequest,
    db: Session = Depends(get_db),
) -> VoiceIntakeView:
    service = VoiceIntakeService(db)
    try:
        return service.retrieve_voice_intake(payload.voice_intake_token)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/voice-intakes/confirm",
    response_model=VoiceIntakeView,
    responses={
        400: {"model": ErrorResponse, "description": "Voice transcript confirmation failed."},
        404: {"model": ErrorResponse, "description": "Voice intake not found."},
    },
)
def confirm_voice_intake(
    payload: VoiceTranscriptConfirmRequest,
    db: Session = Depends(get_db),
) -> VoiceIntakeView:
    service = VoiceIntakeService(db)
    try:
        return service.confirm_transcript(
            voice_intake_token=payload.voice_intake_token,
            confirmed_transcript_text=payload.confirmed_transcript_text,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@staff_router.get(
    "/{case_id}/voice",
    response_model=StaffCaseVoiceResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing, expired, revoked, or invalid bearer session."},
        404: {"model": ErrorResponse, "description": "Case voice intake not found."},
    },
)
def get_case_voice(
    case_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> StaffCaseVoiceResponse:
    voice = VoiceIntakeService(db).get_staff_case_voice(case_id)
    if voice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case voice intake not found.")
    return voice


@staff_router.get(
    "/{case_id}/voice/audio",
    response_class=FileResponse,
    responses={
        200: {"description": "Authorized staff audio download."},
        401: {"model": ErrorResponse, "description": "Missing, expired, revoked, or invalid bearer session."},
        404: {"model": ErrorResponse, "description": "Voice audio not found."},
    },
)
def get_case_voice_audio(
    case_id: int,
    db: Session = Depends(get_db),
    session_context: StaffSessionContext = Depends(require_staff_session),
) -> Response:
    try:
        access = VoiceIntakeService(db).open_staff_case_audio(case_id=case_id, actor=session_context.user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return FileResponse(
        access.file_path,
        media_type=access.content_type,
        filename=access.file_name,
    )
