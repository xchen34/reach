from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_staff_session
from app.models.enums import ReportTriageStatus
from app.schemas.report import (
    ReportDetailResponse,
    ReportInboxResponse,
    StaffReportCreateCaseRequest,
    StaffReportCreateCaseResponse,
    StaffReportCreateTaskRequest,
    StaffReportLinkCaseRequest,
    StaffReportLinkCaseResponse,
    StaffReportNoteRequest,
    StaffReportNoteResponse,
    StaffReportTriageDecisionRequest,
    StaffReportTriageDecisionResponse,
)
from app.services.report_service import ReportService


router = APIRouter(prefix="/staff/reports", tags=["staff-reports"])


@router.get("", response_model=ReportInboxResponse)
def list_reports(
    triage_status: Optional[ReportTriageStatus] = Query(default=None),
    incident_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> ReportInboxResponse:
    return ReportService(db).list_reports(triage_status=triage_status, incident_id=incident_id)


@router.get("/{report_id}", response_model=ReportDetailResponse)
def get_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> ReportDetailResponse:
    report = ReportService(db).get_report(report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.post("/{report_id}/create-case", response_model=StaffReportCreateCaseResponse)
def create_case_from_report(
    report_id: int,
    payload: StaffReportCreateCaseRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportCreateCaseResponse:
    try:
        return ReportService(db).create_case_from_report(report_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{report_id}/create-task", response_model=StaffReportCreateCaseResponse)
def create_task_from_report(
    report_id: int,
    payload: StaffReportCreateTaskRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportCreateCaseResponse:
    try:
        return ReportService(db).create_task_from_report(report_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{report_id}/link-case", response_model=StaffReportLinkCaseResponse)
def link_report_to_case(
    report_id: int,
    payload: StaffReportLinkCaseRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportLinkCaseResponse:
    try:
        return ReportService(db).link_report_to_case(report_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{report_id}/out-of-scope", response_model=StaffReportTriageDecisionResponse)
def mark_report_out_of_scope(
    report_id: int,
    payload: StaffReportTriageDecisionRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportTriageDecisionResponse:
    try:
        return ReportService(db).mark_out_of_scope(report_id, session_context.user, payload.note)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{report_id}/invalid-or-insufficient", response_model=StaffReportTriageDecisionResponse)
def mark_report_invalid_or_insufficient(
    report_id: int,
    payload: StaffReportTriageDecisionRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportTriageDecisionResponse:
    try:
        return ReportService(db).mark_invalid_or_insufficient(report_id, session_context.user, payload.note)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{report_id}/notes", response_model=StaffReportNoteResponse)
def add_report_note(
    report_id: int,
    payload: StaffReportNoteRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffReportNoteResponse:
    try:
        return ReportService(db).add_note(report_id, session_context.user, payload.note)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
