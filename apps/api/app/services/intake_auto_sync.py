"""Periodic background pull of Google Sheets intake sources.

Importing was manual, so a submitted form stayed invisible until a coordinator
pressed Sync sheet. During an active incident that delay is the gap between a
report existing and anyone knowing about it.

The loop is deliberately conservative:
  * disabled unless `intake_auto_sync_enabled` is set, so it never surprises a
    deployment by reaching an external API on a timer;
  * the import is blocking (urllib plus a synchronous SQLAlchemy session), so it
    runs in a worker thread and cannot stall the event loop;
  * every source is isolated — one failing sheet must not stop the others, and
    no failure may kill the loop.
"""

from __future__ import annotations

import asyncio
import logging
import threading

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models.enums import IntakeSourceType
from app.models.incident_intake_source import IncidentIntakeSource
from app.services.google_sheets_importer import GoogleSheetsImportService


logger = logging.getLogger(__name__)


# One sync at a time. The periodic loop and the webhook can fire together, and
# two concurrent passes over the same sheet would both try to insert the same
# rows and collide on uq_reports_source_identity.
_sync_lock = threading.Lock()


def run_auto_sync_once(*, skip_if_busy: bool = False) -> dict[str, int]:
    """Import every active sheet-backed source. Returns totals for logging.

    With `skip_if_busy`, returns immediately when a sync is already running —
    correct for a webhook, since the in-flight pass will pick up the same new
    rows anyway.
    """
    if not _sync_lock.acquire(blocking=not skip_if_busy):
        logger.info("Intake sync already running, skipping this trigger")
        return {"sources": 0, "imported": 0, "withdrawn": 0, "failed_sources": 0, "skipped_busy": 1}
    try:
        return _run_auto_sync_locked()
    finally:
        _sync_lock.release()


def _run_auto_sync_locked() -> dict[str, int]:
    totals = {"sources": 0, "imported": 0, "withdrawn": 0, "failed_sources": 0, "skipped_busy": 0}
    with SessionLocal() as db:
        sources = db.scalars(
            select(IncidentIntakeSource).where(
                IncidentIntakeSource.is_active.is_(True),
                IncidentIntakeSource.source_type == IntakeSourceType.GOOGLE_SHEETS,
            )
        ).all()
        targets = [(source.incident_id, source.id) for source in sources]

    for incident_id, source_id in targets:
        totals["sources"] += 1
        # A fresh session per source so one rollback cannot poison the rest.
        with SessionLocal() as db:
            try:
                result = GoogleSheetsImportService(db).import_intake_source(
                    incident_id=incident_id,
                    source_id=source_id,
                    actor=None,
                )
                totals["imported"] += result.imported
                totals["withdrawn"] += result.withdrawn
            except Exception:
                totals["failed_sources"] += 1
                db.rollback()
                logger.exception(
                    "Automatic intake sync failed for incident=%s source=%s",
                    incident_id,
                    source_id,
                )
    return totals


async def auto_sync_loop() -> None:
    settings = get_settings()
    interval = max(60, settings.intake_auto_sync_interval_seconds)
    logger.info("Automatic intake sync enabled, every %ss", interval)

    while True:
        try:
            # Blocking work: keep it off the event loop.
            totals = await asyncio.to_thread(run_auto_sync_once)
            if totals["imported"] or totals["withdrawn"] or totals["failed_sources"]:
                logger.info(
                    "Automatic intake sync: %s source(s), %s new, %s withdrawn, %s failed",
                    totals["sources"],
                    totals["imported"],
                    totals["withdrawn"],
                    totals["failed_sources"],
                )
        except asyncio.CancelledError:
            logger.info("Automatic intake sync stopped")
            raise
        except Exception:
            # Never let an unexpected error end the loop.
            logger.exception("Automatic intake sync iteration failed")

        await asyncio.sleep(interval)
