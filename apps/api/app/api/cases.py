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
    StaffCaseOutcomeRequest,
    StaffCasePublishRequest,
    StaffCasePublishResponse,
    StaffCaseRelationRequest,
    StaffCaseRelationResponse,
)
from app.schemas.intake_review import StaffCaseIntakeReviewResponse
from app.schemas.staff_queue import StaffQueueResponse
from app.services.case_intake_review import CaseIntakeReviewService
from app.services.case_service import CaseService
from app.services.staff_queue_service import StaffQueueService


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


@staff_router.get("/queue", response_model=StaffQueueResponse, include_in_schema=False)
def get_publish_queue(
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> StaffQueueResponse:
    return StaffQueueService(db).get_publish_queue()


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


@staff_router.get(
    "/{case_id}/intake-review",
    response_model=StaffCaseIntakeReviewResponse,
    include_in_schema=False,
)
def get_case_intake_review(
    case_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> StaffCaseIntakeReviewResponse:
    review = CaseIntakeReviewService(db).get_staff_review(case_id)
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return review


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


@staff_router.post("/{case_id}/assign", response_model=CaseDetailResponse)
def assign_case_to_self(
    case_id: int,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> CaseDetailResponse:
    try:
        return CaseService(db).assign_to_self(case_id, session_context.user)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@staff_router.post("/{case_id}/return-unassigned", response_model=CaseDetailResponse)
def return_case_to_unassigned(
    case_id: int,
    payload: StaffCaseOutcomeRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> CaseDetailResponse:
    try:
        return CaseService(db).return_to_unassigned(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@staff_router.post("/{case_id}/mark-safe", response_model=CaseDetailResponse)
def mark_case_safe_information_received(
    case_id: int,
    payload: StaffCaseOutcomeRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> CaseDetailResponse:
    try:
        return CaseService(db).mark_safe_information_received(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@staff_router.post("/{case_id}/mark-deceased", response_model=CaseDetailResponse)
def mark_case_death_confirmed(
    case_id: int,
    payload: StaffCaseOutcomeRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> CaseDetailResponse:
    try:
        return CaseService(db).mark_death_confirmed(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@staff_router.post(
    "/{case_id}/publish",
    response_model=StaffCasePublishResponse,
    include_in_schema=False,
)
def publish_case_update(
    case_id: int,
    payload: StaffCasePublishRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffCasePublishResponse:
    try:
        return CaseService(db).publish_case_update(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@staff_router.post(
    "/{case_id}/relations",
    response_model=StaffCaseRelationResponse,
    include_in_schema=False,
)
def create_case_relation(
    case_id: int,
    payload: StaffCaseRelationRequest,
    db: Session = Depends(get_db),
    session_context=Depends(require_staff_session),
) -> StaffCaseRelationResponse:
    try:
        return CaseService(db).relate_case(case_id, session_context.user, payload)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
