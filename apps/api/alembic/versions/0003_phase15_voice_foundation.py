"""phase 1.5 voice foundation

Revision ID: 0003_phase15_voice_foundation
Revises: 0002_phase1_domain_foundation
Create Date: 2026-07-08 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_phase15_voice_foundation"
down_revision = "0002_phase1_domain_foundation"
branch_labels = None
depends_on = None


voice_processing_status = postgresql.ENUM(
    "PENDING",
    "COMPLETED",
    "FAILED",
    name="voice_processing_status",
)
voice_transcript_state = postgresql.ENUM(
    "GENERATED",
    "CONFIRMED",
    "EDITED",
    name="voice_transcript_state",
)
voice_retention_state = postgresql.ENUM(
    "RETAINED",
    "DELETED",
    name="voice_retention_state",
)


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'VOICE_INTAKE_UPLOADED'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'VOICE_TRANSCRIPT_CONFIRMED'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'VOICE_TRANSCRIPT_ATTACHED'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'STAFF_VOICE_AUDIO_ACCESSED'")

    voice_processing_status.create(bind, checkfirst=True)
    voice_transcript_state.create(bind, checkfirst=True)
    voice_retention_state.create(bind, checkfirst=True)

    op.create_table(
        "voice_intakes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_token_hash", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column(
            "processing_status",
            postgresql.ENUM(
                "PENDING",
                "COMPLETED",
                "FAILED",
                name="voice_processing_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("transcription_text", sa.Text(), nullable=True),
        sa.Column("transcription_language_code", sa.String(length=8), nullable=True),
        sa.Column("transcription_confidence", sa.Float(), nullable=True),
        sa.Column("confirmed_transcript_text", sa.Text(), nullable=True),
        sa.Column(
            "transcript_state",
            postgresql.ENUM(
                "GENERATED",
                "CONFIRMED",
                "EDITED",
                name="voice_transcript_state",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "retention_state",
            postgresql.ENUM(
                "RETAINED",
                "DELETED",
                name="voice_retention_state",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("attached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_voice_intakes_public_token_hash", "voice_intakes", ["public_token_hash"], unique=True)
    op.create_index("ix_voice_intakes_storage_key", "voice_intakes", ["storage_key"], unique=True)
    op.create_index("ix_voice_intakes_case_id", "voice_intakes", ["case_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_voice_intakes_case_id", table_name="voice_intakes")
    op.drop_index("ix_voice_intakes_storage_key", table_name="voice_intakes")
    op.drop_index("ix_voice_intakes_public_token_hash", table_name="voice_intakes")
    op.drop_table("voice_intakes")

    voice_retention_state.drop(bind, checkfirst=True)
    voice_transcript_state.drop(bind, checkfirst=True)
    voice_processing_status.drop(bind, checkfirst=True)
