from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import StaffSessionContext, get_db, require_staff_session
from app.models.enums import StaffRole
from app.schemas.incident import (
    IncidentIntakeImportResponse,
    PublicIncidentReportPageResponse,
    StaffIncidentSummary,
)
from app.services.google_sheets_importer import GoogleSheetsImportService
from app.services.incident_service import IncidentService


router = APIRouter(prefix="/incidents", tags=["incidents"])
staff_router = APIRouter(prefix="/staff/incidents", tags=["staff-incidents"])


@router.get("/current/report", response_model=PublicIncidentReportPageResponse)
def get_current_public_incident_report_page(
    db: Session = Depends(get_db),
) -> PublicIncidentReportPageResponse:
    incident = IncidentService(db).get_current_public_report_page()
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident intake is not available.")
    return incident


@router.get("/{incident_slug}/report", response_model=PublicIncidentReportPageResponse)
def get_public_incident_report_page(
    incident_slug: str,
    db: Session = Depends(get_db),
) -> PublicIncidentReportPageResponse:
    incident = IncidentService(db).get_public_report_page(incident_slug)
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident intake is not available.")
    return incident


@staff_router.get("", response_model=list[StaffIncidentSummary])
def list_staff_incidents(
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> list[StaffIncidentSummary]:
    return IncidentService(db).list_staff_incidents()


@staff_router.post(
    "/{incident_id}/intake-sources/{source_id}/import",
    response_model=IncidentIntakeImportResponse,
)
def import_incident_intake_source(
    incident_id: int,
    source_id: int,
    db: Session = Depends(get_db),
    session_context: StaffSessionContext = Depends(require_staff_session),
) -> IncidentIntakeImportResponse:
    if session_context.user.role != StaffRole.COORDINATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only coordinators can import intake sources.",
        )
    try:
        return GoogleSheetsImportService(db).import_intake_source(
            incident_id=incident_id,
            source_id=source_id,
            actor=session_context.user,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google Sheets import failed.",
        ) from exc
