from pathlib import Path

from fastapi import FastAPI

from app.api.audit import router as audit_router
from app.api.auth import router as auth_router
from app.api.cases import router as cases_router
from app.api.cases import staff_router as staff_cases_router
from app.api.health import router as health_router
from app.api.share_links import router as share_links_router
from app.api.staff import router as staff_router


app = FastAPI(
    title="Beacon API",
    version="0.2.0",
    description="Phase 1 domain foundation for Beacon",
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(staff_router)
app.include_router(cases_router)
app.include_router(staff_cases_router)
app.include_router(share_links_router)
app.include_router(audit_router)


@app.get("/openapi.yaml", include_in_schema=False)
def openapi_contract() -> str:
    return Path(__file__).resolve().parents[3].joinpath("docs/openapi.yaml").read_text()
