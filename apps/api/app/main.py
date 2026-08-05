import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audit import router as audit_router
from app.api.attachments import router as attachments_router
from app.api.attachments import staff_router as staff_attachments_router
from app.api.auth import router as auth_router
from app.api.board import router as board_router
from app.api.cases import router as cases_router
from app.api.cases import staff_router as staff_cases_router
from app.api.google_forms import router as google_forms_router
from app.api.health import router as health_router
from app.api.incidents import router as incidents_router
from app.api.incidents import staff_router as staff_incidents_router
from app.api.reports import router as reports_router
from app.api.share_links import router as share_links_router
from app.api.staff import router as staff_router
from app.api.voice import router as voice_router
from app.api.voice import staff_router as staff_voice_router
from app.config import get_settings
from app.services.intake_auto_sync import auto_sync_loop


settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Own the background intake sync for the lifetime of the app."""
    task: asyncio.Task | None = None
    if settings.intake_auto_sync_enabled:
        # Uvicorn only configures its own loggers, so application INFO records
        # would otherwise fall through to the level-WARNING last-resort handler
        # and the sync would run invisibly.
        if not logging.getLogger().handlers:
            logging.basicConfig(level=logging.INFO)
        logging.getLogger("app").setLevel(logging.INFO)
        task = asyncio.create_task(auto_sync_loop())
    else:
        logger.info("Automatic intake sync is disabled")

    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            # Await the cancellation so shutdown does not leave it running.
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title="Reach API",
    version="0.3.0",
    description="Phase 1.5 voice intake foundation for Reach",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(attachments_router)
app.include_router(staff_router)
app.include_router(board_router)
app.include_router(cases_router)
app.include_router(google_forms_router)
app.include_router(incidents_router)
app.include_router(staff_incidents_router)
app.include_router(staff_cases_router)
app.include_router(reports_router)
app.include_router(staff_attachments_router)
app.include_router(voice_router)
app.include_router(staff_voice_router)
app.include_router(share_links_router)
app.include_router(audit_router)


@app.get("/openapi.yaml", include_in_schema=False)
def openapi_contract() -> str:
    return Path(__file__).resolve().parents[3].joinpath("docs/openapi.yaml").read_text()
