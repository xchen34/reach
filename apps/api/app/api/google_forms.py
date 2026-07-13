from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_db
from app.schemas.google_forms import GoogleFormIngestRequest, GoogleFormIngestResponse
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
