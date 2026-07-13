"""report first phase 1

Revision ID: 0004_report_first_phase1
Revises: 0003_phase15_voice_foundation
Create Date: 2026-07-13 13:45:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_report_first_phase1"
down_revision = "0003_phase15_voice_foundation"
branch_labels = None
depends_on = None


report_source_channel = postgresql.ENUM(
    "GOOGLE_FORM",
    "ANONYMOUS_WEB",
    "VOICE",
    "MANUAL_STAFF_ENTRY",
    "LEGACY_MIGRATION",
    name="report_source_channel",
)
report_triage_status = postgresql.ENUM(
    "AWAITING_REVIEW",
    "LINKED_TO_CASE",
    "OUT_OF_SCOPE",
    "INVALID_OR_INSUFFICIENT",
    name="report_triage_status",
)
report_triage_action_type = postgresql.ENUM(
    "CREATE_CASE",
    "LINK_EXISTING_CASE",
    "MARK_OUT_OF_SCOPE",
    "MARK_INVALID_OR_INSUFFICIENT",
    "NOTE",
    name="report_triage_action_type",
)
case_safety_status = postgresql.ENUM(
    "UNKNOWN",
    "POSSIBLY_AT_RISK",
    "CONFIRMED_SAFE",
    "SUSPECTED_DECEASED_AWAITING_AUTHORIZED_CONFIRMATION",
    "CONFIRMED_DECEASED",
    name="case_safety_status",
)
case_handling_status = postgresql.ENUM(
    "AWAITING_ACTION",
    "BEING_INVESTIGATED",
    "ESCALATED_TO_RESCUERS",
    "AWAITING_EXTERNAL_FEEDBACK",
    "ARCHIVED",
    name="case_handling_status",
)
case_verification_task = postgresql.ENUM(
    "CONFIRM_IDENTITY",
    "CONFIRM_LAST_KNOWN_LOCATION",
    "COMPARE_POSSIBLE_SAME_PERSON",
    "CONTACT_REPORTER",
    "AWAIT_RESPONDER_FEEDBACK",
    "AWAIT_AUTHORIZED_CONFIRMATION",
    "NONE",
    name="case_verification_task",
)


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'REPORT_RECEIVED'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'REPORT_TRIAGED'")
    op.execute("ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'REPORT_LINKED_TO_CASE'")

    report_source_channel.create(bind, checkfirst=True)
    report_triage_status.create(bind, checkfirst=True)
    report_triage_action_type.create(bind, checkfirst=True)
    case_safety_status.create(bind, checkfirst=True)
    case_handling_status.create(bind, checkfirst=True)
    case_verification_task.create(bind, checkfirst=True)

    op.add_column("cases", sa.Column("person_label", sa.String(length=160), nullable=True))
    op.add_column("cases", sa.Column("approximate_age", sa.String(length=80), nullable=True))
    op.add_column("cases", sa.Column("appearance", sa.Text(), nullable=True))
    op.add_column("cases", sa.Column("clothing", sa.Text(), nullable=True))
    op.add_column("cases", sa.Column("identifying_details", sa.Text(), nullable=True))
    op.add_column("cases", sa.Column("mobility", sa.String(length=160), nullable=True))
    op.add_column("cases", sa.Column("companions", sa.Text(), nullable=True))
    op.add_column("cases", sa.Column("last_known_location", sa.String(length=280), nullable=True))
    op.add_column("cases", sa.Column("last_known_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "cases",
        sa.Column(
            "safety_status",
            postgresql.ENUM(
                "UNKNOWN",
                "POSSIBLY_AT_RISK",
                "CONFIRMED_SAFE",
                "SUSPECTED_DECEASED_AWAITING_AUTHORIZED_CONFIRMATION",
                "CONFIRMED_DECEASED",
                name="case_safety_status",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "cases",
        sa.Column(
            "handling_status",
            postgresql.ENUM(
                "AWAITING_ACTION",
                "BEING_INVESTIGATED",
                "ESCALATED_TO_RESCUERS",
                "AWAITING_EXTERNAL_FEEDBACK",
                "ARCHIVED",
                name="case_handling_status",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "cases",
        sa.Column(
            "verification_task",
            postgresql.ENUM(
                "CONFIRM_IDENTITY",
                "CONFIRM_LAST_KNOWN_LOCATION",
                "COMPARE_POSSIBLE_SAME_PERSON",
                "CONTACT_REPORTER",
                "AWAIT_RESPONDER_FEEDBACK",
                "AWAIT_AUTHORIZED_CONFIRMATION",
                "NONE",
                name="case_verification_task",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column("cases", sa.Column("confirmation_source", sa.String(length=280), nullable=True))
    op.add_column("cases", sa.Column("confirmation_source_type", sa.String(length=80), nullable=True))
    op.add_column("cases", sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("merged_into_case_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_cases_merged_into_case_id_cases",
        "cases",
        "cases",
        ["merged_into_case_id"],
        ["id"],
    )
    op.create_index("ix_cases_safety_status", "cases", ["safety_status"], unique=False)
    op.create_index("ix_cases_handling_status", "cases", ["handling_status"], unique=False)
    op.create_index("ix_cases_verification_task", "cases", ["verification_task"], unique=False)
    op.create_index("ix_cases_merged_into_case_id", "cases", ["merged_into_case_id"], unique=False)

    op.execute(
        """
        UPDATE cases
        SET
            safety_status = CASE
                WHEN status = 'SAFE_RESOLVED' THEN 'CONFIRMED_SAFE'::case_safety_status
                ELSE 'UNKNOWN'::case_safety_status
            END,
            handling_status = CASE
                WHEN status = 'PENDING_REVIEW' THEN 'AWAITING_ACTION'::case_handling_status
                WHEN status = 'ACTIVE' THEN 'BEING_INVESTIGATED'::case_handling_status
                WHEN status = 'WAITING_FOR_INFORMATION' THEN 'AWAITING_EXTERNAL_FEEDBACK'::case_handling_status
                WHEN status = 'SAFE_RESOLVED' THEN 'ARCHIVED'::case_handling_status
                ELSE 'ARCHIVED'::case_handling_status
            END,
            verification_task = 'NONE'::case_verification_task
        """
    )
    op.alter_column("cases", "safety_status", nullable=False)
    op.alter_column("cases", "handling_status", nullable=False)
    op.alter_column("cases", "verification_task", nullable=False)

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_code", sa.String(length=24), nullable=False),
        sa.Column(
            "source_channel",
            postgresql.ENUM(
                "GOOGLE_FORM",
                "ANONYMOUS_WEB",
                "VOICE",
                "MANUAL_STAFF_ENTRY",
                "LEGACY_MIGRATION",
                name="report_source_channel",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("source_form_id", sa.String(length=160), nullable=True),
        sa.Column("source_form_name", sa.String(length=160), nullable=True),
        sa.Column("source_entry_id", sa.String(length=160), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("language_code", sa.String(length=8), nullable=False),
        sa.Column("raw_answers_json", sa.JSON(), nullable=True),
        sa.Column("original_narrative", sa.Text(), nullable=False),
        sa.Column("location_text", sa.String(length=280), nullable=False),
        sa.Column("reporter_name", sa.String(length=120), nullable=True),
        sa.Column("reporter_email", sa.String(length=320), nullable=True),
        sa.Column("reporter_phone", sa.String(length=40), nullable=True),
        sa.Column("reporter_relationship", sa.String(length=80), nullable=True),
        sa.Column("is_first_hand", sa.Boolean(), nullable=True),
        sa.Column("permission_to_contact", sa.Boolean(), nullable=True),
        sa.Column("media_refs_json", sa.JSON(), nullable=True),
        sa.Column("voice_intake_id", sa.Integer(), sa.ForeignKey("voice_intakes.id"), nullable=True),
        sa.Column(
            "triage_status",
            postgresql.ENUM(
                "AWAITING_REVIEW",
                "LINKED_TO_CASE",
                "OUT_OF_SCOPE",
                "INVALID_OR_INSUFFICIENT",
                name="report_triage_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("triaged_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("legacy_case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("is_legacy_backfill", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("migration_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reports_report_code", "reports", ["report_code"], unique=True)
    op.create_index("ix_reports_triage_status", "reports", ["triage_status"], unique=False)
    op.create_index("ix_reports_source_channel", "reports", ["source_channel"], unique=False)
    op.create_index("ix_reports_received_at", "reports", ["received_at"], unique=False)
    op.create_index("ix_reports_legacy_case_id", "reports", ["legacy_case_id"], unique=False)
    op.create_index("ix_reports_voice_intake_id", "reports", ["voice_intake_id"], unique=True)
    op.create_index(
        "uq_reports_source_identity",
        "reports",
        ["source_channel", "source_form_id", "source_entry_id"],
        unique=True,
        postgresql_where=sa.text("source_form_id IS NOT NULL AND source_entry_id IS NOT NULL"),
    )

    op.create_table(
        "case_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("linked_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("link_reason", sa.String(length=400), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("case_id", "report_id", name="uq_case_reports_case_report"),
        sa.UniqueConstraint("report_id", name="uq_case_reports_report_id"),
    )
    op.create_index("ix_case_reports_case_id", "case_reports", ["case_id"], unique=False)
    op.create_index("ix_case_reports_report_id", "case_reports", ["report_id"], unique=False)

    op.create_table(
        "report_triage_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "action_type",
            postgresql.ENUM(
                "CREATE_CASE",
                "LINK_EXISTING_CASE",
                "MARK_OUT_OF_SCOPE",
                "MARK_INVALID_OR_INSUFFICIENT",
                "NOTE",
                name="report_triage_action_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "from_status",
            postgresql.ENUM(
                "AWAITING_REVIEW",
                "LINKED_TO_CASE",
                "OUT_OF_SCOPE",
                "INVALID_OR_INSUFFICIENT",
                name="report_triage_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            postgresql.ENUM(
                "AWAITING_REVIEW",
                "LINKED_TO_CASE",
                "OUT_OF_SCOPE",
                "INVALID_OR_INSUFFICIENT",
                name="report_triage_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_report_triage_actions_report_id", "report_triage_actions", ["report_id"], unique=False)
    op.create_index(
        "ix_report_triage_actions_actor_user_id",
        "report_triage_actions",
        ["actor_user_id"],
        unique=False,
    )
    op.create_index("ix_report_triage_actions_case_id", "report_triage_actions", ["case_id"], unique=False)

    op.execute(
        """
        INSERT INTO reports (
            report_code,
            source_channel,
            source_form_id,
            source_form_name,
            source_entry_id,
            submitted_at,
            received_at,
            language_code,
            raw_answers_json,
            original_narrative,
            location_text,
            reporter_name,
            reporter_email,
            reporter_phone,
            triage_status,
            triaged_at,
            legacy_case_id,
            is_legacy_backfill,
            migration_note,
            created_at,
            updated_at
        )
        SELECT
            'LEG-' || cases.id::text,
            'LEGACY_MIGRATION'::report_source_channel,
            NULL,
            'Legacy Case Migration',
            cases.id::text,
            cases.created_at,
            cases.created_at,
            cases.language_code,
            json_build_object(
                'legacy_case_id', cases.id,
                'case_code', cases.case_code,
                'status', cases.status::text,
                'urgency', cases.urgency::text,
                'incident_type', cases.incident_type::text
            ),
            cases.needs_summary,
            cases.location_summary,
            cases.reporter_name,
            cases.reporter_email,
            cases.reporter_phone,
            'LINKED_TO_CASE'::report_triage_status,
            now(),
            cases.id,
            true,
            'Synthetic Report created from legacy Case during Report-first migration.',
            cases.created_at,
            cases.updated_at
        FROM cases
        """
    )
    op.execute(
        """
        INSERT INTO case_reports (case_id, report_id, linked_by_user_id, link_reason, created_at)
        SELECT
            reports.legacy_case_id,
            reports.id,
            NULL,
            'Legacy migration backfill',
            now()
        FROM reports
        WHERE reports.source_channel = 'LEGACY_MIGRATION'::report_source_channel
          AND reports.legacy_case_id IS NOT NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_report_triage_actions_case_id", table_name="report_triage_actions")
    op.drop_index("ix_report_triage_actions_actor_user_id", table_name="report_triage_actions")
    op.drop_index("ix_report_triage_actions_report_id", table_name="report_triage_actions")
    op.drop_table("report_triage_actions")

    op.drop_index("ix_case_reports_report_id", table_name="case_reports")
    op.drop_index("ix_case_reports_case_id", table_name="case_reports")
    op.drop_table("case_reports")

    op.drop_index("uq_reports_source_identity", table_name="reports")
    op.drop_index("ix_reports_voice_intake_id", table_name="reports")
    op.drop_index("ix_reports_legacy_case_id", table_name="reports")
    op.drop_index("ix_reports_received_at", table_name="reports")
    op.drop_index("ix_reports_source_channel", table_name="reports")
    op.drop_index("ix_reports_triage_status", table_name="reports")
    op.drop_index("ix_reports_report_code", table_name="reports")
    op.drop_table("reports")

    op.drop_index("ix_cases_merged_into_case_id", table_name="cases")
    op.drop_index("ix_cases_verification_task", table_name="cases")
    op.drop_index("ix_cases_handling_status", table_name="cases")
    op.drop_index("ix_cases_safety_status", table_name="cases")
    op.drop_constraint("fk_cases_merged_into_case_id_cases", "cases", type_="foreignkey")
    op.drop_column("cases", "merged_into_case_id")
    op.drop_column("cases", "confirmed_at")
    op.drop_column("cases", "confirmation_source_type")
    op.drop_column("cases", "confirmation_source")
    op.drop_column("cases", "verification_task")
    op.drop_column("cases", "handling_status")
    op.drop_column("cases", "safety_status")
    op.drop_column("cases", "last_known_time")
    op.drop_column("cases", "last_known_location")
    op.drop_column("cases", "companions")
    op.drop_column("cases", "mobility")
    op.drop_column("cases", "identifying_details")
    op.drop_column("cases", "clothing")
    op.drop_column("cases", "appearance")
    op.drop_column("cases", "approximate_age")
    op.drop_column("cases", "person_label")

    case_verification_task.drop(bind, checkfirst=True)
    case_handling_status.drop(bind, checkfirst=True)
    case_safety_status.drop(bind, checkfirst=True)
    report_triage_action_type.drop(bind, checkfirst=True)
    report_triage_status.drop(bind, checkfirst=True)
    report_source_channel.drop(bind, checkfirst=True)
