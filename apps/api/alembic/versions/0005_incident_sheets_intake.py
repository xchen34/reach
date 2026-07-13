"""incident scoped google sheets intake

Revision ID: 0005_incident_sheets_intake
Revises: 0004_report_first_phase1
Create Date: 2026-07-13 16:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_incident_sheets_intake"
down_revision = "0004_report_first_phase1"
branch_labels = None
depends_on = None


incident_status = postgresql.ENUM(
    "DRAFT",
    "ACTIVE",
    "INTAKE_PAUSED",
    "CLOSED",
    "ARCHIVED",
    name="incident_status",
)
intake_source_type = postgresql.ENUM("GOOGLE_SHEETS", name="intake_source_type")


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("ALTER TYPE report_triage_status ADD VALUE IF NOT EXISTS 'LINKED_TO_NEW_CASE'")
    op.execute("ALTER TYPE report_triage_status ADD VALUE IF NOT EXISTS 'LINKED_TO_EXISTING_CASE'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'INTAKE_SOURCE_IMPORTED'")
    incident_status.create(bind, checkfirst=True)
    intake_source_type.create(bind, checkfirst=True)

    op.create_table(
        "incidents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("internal_name", sa.String(length=160), nullable=False),
        sa.Column("public_name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("disaster_type", sa.String(length=80), nullable=False),
        sa.Column("affected_area", sa.String(length=280), nullable=False),
        sa.Column("incident_start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("public_description", sa.Text(), nullable=True),
        sa.Column("supported_languages", sa.JSON(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "DRAFT",
                "ACTIVE",
                "INTAKE_PAUSED",
                "CLOSED",
                "ARCHIVED",
                name="incident_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("form_opening_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("form_closing_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owning_team", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_incidents_slug", "incidents", ["slug"], unique=True)
    op.create_index("ix_incidents_status", "incidents", ["status"], unique=False)

    op.create_table(
        "incident_intake_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column(
            "source_type",
            postgresql.ENUM("GOOGLE_SHEETS", name="intake_source_type", create_type=False),
            nullable=False,
        ),
        sa.Column("google_form_url", sa.String(length=1200), nullable=False),
        sa.Column("google_form_id", sa.String(length=200), nullable=True),
        sa.Column("google_spreadsheet_id", sa.String(length=200), nullable=False),
        sa.Column("google_sheet_name", sa.String(length=200), nullable=False),
        sa.Column("last_imported_row", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_incident_intake_sources_incident_id",
        "incident_intake_sources",
        ["incident_id"],
        unique=False,
    )
    op.create_index(
        "ix_incident_intake_sources_google_form_id",
        "incident_intake_sources",
        ["google_form_id"],
        unique=False,
    )

    op.add_column("cases", sa.Column("incident_id", sa.Integer(), nullable=True))
    op.add_column("reports", sa.Column("incident_id", sa.Integer(), nullable=True))
    op.add_column("reports", sa.Column("intake_source_id", sa.Integer(), nullable=True))

    op.create_foreign_key("fk_cases_incident_id_incidents", "cases", "incidents", ["incident_id"], ["id"])
    op.create_foreign_key("fk_reports_incident_id_incidents", "reports", "incidents", ["incident_id"], ["id"])
    op.create_foreign_key(
        "fk_reports_intake_source_id_incident_intake_sources",
        "reports",
        "incident_intake_sources",
        ["intake_source_id"],
        ["id"],
    )

    op.execute(
        """
        INSERT INTO incidents (
            internal_name,
            public_name,
            slug,
            disaster_type,
            affected_area,
            public_description,
            supported_languages,
            status,
            owning_team
        )
        VALUES (
            'Legacy imported incident',
            'Legacy Reach intake',
            'legacy-reach-intake',
            'legacy',
            'Legacy records before incident scoping',
            'Compatibility incident for records created before Incident-scoped intake.',
            '["en", "fr", "zh"]'::json,
            'ARCHIVED'::incident_status,
            'Reach migration'
        )
        ON CONFLICT (slug) DO NOTHING
        """
    )
    op.execute("UPDATE cases SET incident_id = (SELECT id FROM incidents WHERE slug = 'legacy-reach-intake') WHERE incident_id IS NULL")
    op.execute("UPDATE reports SET incident_id = (SELECT id FROM incidents WHERE slug = 'legacy-reach-intake') WHERE incident_id IS NULL")

    op.alter_column("cases", "incident_id", nullable=False)
    op.alter_column("reports", "incident_id", nullable=False)
    op.create_index("ix_cases_incident_id", "cases", ["incident_id"], unique=False)
    op.create_index("ix_reports_incident_id", "reports", ["incident_id"], unique=False)
    op.create_index("ix_reports_intake_source_id", "reports", ["intake_source_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reports_intake_source_id", table_name="reports")
    op.drop_index("ix_reports_incident_id", table_name="reports")
    op.drop_index("ix_cases_incident_id", table_name="cases")
    op.drop_constraint("fk_reports_intake_source_id_incident_intake_sources", "reports", type_="foreignkey")
    op.drop_constraint("fk_reports_incident_id_incidents", "reports", type_="foreignkey")
    op.drop_constraint("fk_cases_incident_id_incidents", "cases", type_="foreignkey")
    op.drop_column("reports", "intake_source_id")
    op.drop_column("reports", "incident_id")
    op.drop_column("cases", "incident_id")
    op.drop_index("ix_incident_intake_sources_google_form_id", table_name="incident_intake_sources")
    op.drop_index("ix_incident_intake_sources_incident_id", table_name="incident_intake_sources")
    op.drop_table("incident_intake_sources")
    op.drop_index("ix_incidents_status", table_name="incidents")
    op.drop_index("ix_incidents_slug", table_name="incidents")
    op.drop_table("incidents")
    intake_source_type.drop(op.get_bind(), checkfirst=True)
    incident_status.drop(op.get_bind(), checkfirst=True)
