from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_staff_session
from app.schemas.case import (
    AnonymousCaseSubmissionRequest,
    CaseDetailResponse,
    CaseListItem,
    CaseSubmissionResponse,
    StaffCaseActionRequest,
    StaffCaseActionResponse,
)
from app.services.case_service import CaseService


router = APIRouter(tags=["cases"])
staff_router = APIRouter(prefix="/staff/cases", tags=["staff-cases"])


@router.post(
    "/cases",
    response_model=CaseSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"description": "Case submission was rejected."}},
)
def submit_case(
    payload: AnonymousCaseSubmissionRequest,
    db: Session = Depends(get_db),
) -> CaseSubmissionResponse:
    try:
        return CaseService(db).create_anonymous_case(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@staff_router.get("", response_model=list[CaseListItem])
def list_cases(
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> list[CaseListItem]:
    return CaseService(db).list_cases()


@staff_router.get("/{case_id}", response_model=CaseDetailResponse)
def get_case_detail(
    case_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> CaseDetailResponse:
    case = CaseService(db).get_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return case


@staff_router.post("/{case_id}/actions", response_model=StaffCaseActionResponse)
def create_case_action(
    case_id: int,
    payload: StaffCaseActionRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffCaseActionResponse:
    try:
        return CaseService(db).create_action(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
