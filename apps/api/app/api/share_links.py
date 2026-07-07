from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas.case import ShareLinkCaseView
from app.services.case_service import CaseService


router = APIRouter(prefix="/share", tags=["share-links"])


@router.get(
    "/{token}",
    response_model=ShareLinkCaseView,
    description=(
        "Accesses a private case view through a capability URL token. "
        "The token is the only credential required for this endpoint. "
        "Tokens are treated as private secrets and must not be logged or reconstructed by clients. "
        "The current Phase 1 implementation does not expose end-user expiry or revocation management flows."
    ),
)
def get_shared_case(
    token: str = Path(description="Private capability token embedded in the share URL."),
    db: Session = Depends(get_db),
) -> ShareLinkCaseView:
    case_view = CaseService(db).get_shared_case(token)
    if case_view is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found.")
    return case_view
