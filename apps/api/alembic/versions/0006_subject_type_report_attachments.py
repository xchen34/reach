"""subject type and report attachments

Revision ID: 0006_subject_attachments
Revises: 0005_incident_sheets_intake
Create Date: 2026-07-29 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0006_subject_attachments"
down_revision = "0005_incident_sheets_intake"
branch_labels = None
depends_on = None


subject_type = postgresql.ENUM("PERSON", "PET", "UNKNOWN", name="subject_type")
attachment_moderation_status = postgresql.ENUM(
    "PENDING",
    "APPROVED",
    "REJECTED",
    name="attachment_moderation_status",
)


def upgrade() -> None:
    bind = op.get_bind()
    subject_type.create(bind, checkfirst=True)
    attachment_moderation_status.create(bind, checkfirst=True)

    op.add_column(
        "reports",
        sa.Column(
            "subject_type",
            postgresql.ENUM("PERSON", "PET", "UNKNOWN", name="subject_type", create_type=False),
            nullable=False,
            server_default="UNKNOWN",
        ),
    )
    op.add_column(
        "cases",
        sa.Column(
            "subject_type",
            postgresql.ENUM("PERSON", "PET", "UNKNOWN", name="subject_type", create_type=False),
            nullable=False,
            server_default="UNKNOWN",
        ),
    )

    op.create_table(
        "report_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("attachment_code", sa.String(length=24), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False, unique=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("public_visibility", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "moderation_status",
            postgresql.ENUM(
                "PENDING",
                "APPROVED",
                "REJECTED",
                name="attachment_moderation_status",
                create_type=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_report_attachments_attachment_code", "report_attachments", ["attachment_code"])
    op.create_index("ix_report_attachments_case_id", "report_attachments", ["case_id"])
    op.create_index("ix_report_attachments_incident_id", "report_attachments", ["incident_id"])
    op.create_index("ix_report_attachments_report_id", "report_attachments", ["report_id"])

    op.alter_column("reports", "subject_type", server_default=None)
    op.alter_column("cases", "subject_type", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_report_attachments_report_id", table_name="report_attachments")
    op.drop_index("ix_report_attachments_incident_id", table_name="report_attachments")
    op.drop_index("ix_report_attachments_case_id", table_name="report_attachments")
    op.drop_index("ix_report_attachments_attachment_code", table_name="report_attachments")
    op.drop_table("report_attachments")
    op.drop_column("cases", "subject_type")
    op.drop_column("reports", "subject_type")
    attachment_moderation_status.drop(op.get_bind(), checkfirst=True)
    subject_type.drop(op.get_bind(), checkfirst=True)
