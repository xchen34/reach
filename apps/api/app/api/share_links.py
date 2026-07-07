from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas.case import ShareLinkCaseView
from app.services.case_service import CaseService


router = APIRouter(prefix="/share", tags=["share-links"])


@router.get("/{token}", response_model=ShareLinkCaseView)
def get_shared_case(
    token: str,
    db: Session = Depends(get_db),
) -> ShareLinkCaseView:
    case_view = CaseService(db).get_shared_case(token)
    if case_view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found.")
    return case_view

