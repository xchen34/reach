from fastapi import APIRouter, Depends

from app.deps import require_staff_session
from app.schemas.staff import CurrentStaffSession


router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("/me", response_model=CurrentStaffSession)
def current_staff_session(session_context=Depends(require_staff_session)) -> CurrentStaffSession:
    return CurrentStaffSession(
        user=session_context.user,
        session_expires_at=session_context.session.expires_at,
    )

