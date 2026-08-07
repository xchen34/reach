from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_db
from app.schemas.google_forms import GoogleFormIngestRequest, GoogleFormIngestResponse
from app.services.intake_auto_sync import run_auto_sync_once
from app.services.report_service import ReportService


router = APIRouter(prefix="/ingest", tags=["google-form-ingest"])


@router.post(
    "/google-form",
    response_model=GoogleFormIngestResponse,
    include_in_schema=False,
)
def ingest_google_form_report(
    payload: GoogleFormIngestRequest,
    db: Session = Depends(get_db),
    ingest_token: Optional[str] = Header(default=None, alias="x-beacon-ingest-token"),
) -> GoogleFormIngestResponse:
    settings = get_settings()
    if not settings.google_form_ingest_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Form ingest is not configured.",
        )

    if ingest_token != settings.google_form_ingest_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid ingest token.",
        )

    return ReportService(db).create_google_form_report(payload)


class IntakeSyncTriggerResponse(BaseModel):
    """Result of a webhook-triggered sheet pull."""

    sources: int
    imported: int
    withdrawn: int
    failed_sources: int
    skipped_busy: int


@router.post(
    "/sync-intake",
    response_model=IntakeSyncTriggerResponse,
    include_in_schema=False,
)
def trigger_intake_sync(
    ingest_token: Optional[str] = Header(default=None, alias="x-beacon-ingest-token"),
) -> IntakeSyncTriggerResponse:
    """Pull the sheets now, for a Google Apps Script onFormSubmit trigger.

    The script only has to say "there is something new" — it needs to know
    nothing about the form's fields, so the sheet mapping stays the single place
    that understands them. Sending the answers directly to /ingest/google-form
    would instead mean two mappings to keep in step with every form change.

    This does not replace the periodic sync. Apps Script trigger failures are
    silent — quota, a script error, a Google hiccup — so the timer stays as the
    safety net that stops a report being lost without anyone knowing.
    """
    settings = get_settings()
    if not settings.google_form_ingest_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Form ingest is not configured.",
        )
    if ingest_token != settings.google_form_ingest_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid ingest token.",
        )

    # Concurrent submissions must not start overlapping passes over one sheet.
    totals = run_auto_sync_once(skip_if_busy=True)
    return IntakeSyncTriggerResponse(
        sources=totals.get("sources", 0),
        imported=totals.get("imported", 0),
        withdrawn=totals.get("withdrawn", 0),
        failed_sources=totals.get("failed_sources", 0),
        skipped_busy=totals.get("skipped_busy", 0),
    )
