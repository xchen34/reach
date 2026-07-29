from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.db import Base


def test_model_metadata_contains_phase15_tables() -> None:
    metadata = Base.metadata
    for table_name in (
        "users",
        "magic_link_tokens",
        "staff_sessions",
        "cases",
        "case_share_links",
        "case_actions",
        "audit_log_entries",
        "voice_intakes",
        "incidents",
        "incident_intake_sources",
        "reports",
        "case_reports",
        "report_triage_actions",
        "report_attachments",
    ):
        assert table_name in metadata.tables


def test_alembic_has_single_head() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == ["0006_subject_attachments"]
