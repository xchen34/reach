from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audit import router as audit_router
from app.api.auth import router as auth_router
from app.api.board import router as board_router
from app.api.cases import router as cases_router
from app.api.cases import staff_router as staff_cases_router
from app.api.health import router as health_router
from app.api.share_links import router as share_links_router
from app.api.staff import router as staff_router
from app.api.voice import router as voice_router
from app.api.voice import staff_router as staff_voice_router
from app.config import get_settings


app = FastAPI(
    title="Beacon API",
    version="0.3.0",
    description="Phase 1.5 voice intake foundation for Beacon",
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(staff_router)
app.include_router(board_router)
app.include_router(cases_router)
app.include_router(staff_cases_router)
app.include_router(voice_router)
app.include_router(staff_voice_router)
app.include_router(share_links_router)
app.include_router(audit_router)


@app.get("/openapi.yaml", include_in_schema=False)
def openapi_contract() -> str:
    return Path(__file__).resolve().parents[3].joinpath("docs/openapi.yaml").read_text()
