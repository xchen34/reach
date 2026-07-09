from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas.board import PublicBoardResponse
from app.services.board_service import BoardService


router = APIRouter(prefix="/board", tags=["board"])


@router.get(
    "",
    response_model=PublicBoardResponse,
    include_in_schema=False,
)
def get_public_board(
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> PublicBoardResponse:
    return BoardService(db).get_public_board(include_archived=include_archived)
