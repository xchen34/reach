from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, require_staff_session
from app.schemas.audit import AuditLogEntryResponse
from app.services.case_service import CaseService


router = APIRouter(prefix="/staff/cases", tags=["staff-audit"])


@router.get("/{case_id}/audit", response_model=list[AuditLogEntryResponse])
def list_case_audit(
    case_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_staff_session),
) -> list[AuditLogEntryResponse]:
    return CaseService(db).list_audit_entries(case_id)
