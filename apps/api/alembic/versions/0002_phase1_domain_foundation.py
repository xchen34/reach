"""phase 1 domain foundation

Revision ID: 0002_phase1_domain_foundation
Revises: 0001_initial_auth_foundation
Create Date: 2026-07-07 15:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_phase1_domain_foundation"
down_revision = "0001_initial_auth_foundation"
branch_labels = None
depends_on = None


case_status = postgresql.ENUM(
    "PENDING_REVIEW",
    "ACTIVE",
    "WAITING_FOR_INFORMATION",
    "SAFE_RESOLVED",
    "CLOSED",
    name="case_status",
)
urgency_level = postgresql.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL", name="urgency_level")
incident_type = postgresql.ENUM(
    "MEDICAL",
    "FIRE",
    "EVACUATION",
    "SHELTER",
    "UTILITIES",
    "OTHER",
    name="incident_type",
)
share_link_scope = postgresql.ENUM("STATUS_ONLY", name="share_link_scope")
case_action_type = postgresql.ENUM("NOTE", "STATUS_CHANGE", "CLAIM", "REASSIGN", name="case_action_type")
audit_actor_type = postgresql.ENUM("ANONYMOUS", "STAFF", "SYSTEM", name="audit_actor_type")
audit_event_type = postgresql.ENUM(
    "MAGIC_LINK_REQUESTED",
    "MAGIC_LINK_VERIFIED",
    "SESSION_CREATED",
    "CASE_SUBMITTED",
    "CASE_VIEWED",
    "CASE_ACTION_CREATED",
    "SHARE_LINK_CREATED",
    "SHARE_LINK_VIEWED",
    name="audit_event_type",
)


def upgrade() -> None:
    bind = op.get_bind()
    case_status.create(bind, checkfirst=True)
    urgency_level.create(bind, checkfirst=True)
    incident_type.create(bind, checkfirst=True)
    share_link_scope.create(bind, checkfirst=True)
    case_action_type.create(bind, checkfirst=True)
    audit_actor_type.create(bind, checkfirst=True)
    audit_event_type.create(bind, checkfirst=True)

    op.create_table(
        "staff_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_staff_sessions_token_hash", "staff_sessions", ["token_hash"], unique=True)
    op.create_index("ix_staff_sessions_user_id", "staff_sessions", ["user_id"], unique=False)

    op.create_table(
        "cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_code", sa.String(length=24), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING_REVIEW",
                "ACTIVE",
                "WAITING_FOR_INFORMATION",
                "SAFE_RESOLVED",
                "CLOSED",
                name="case_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "urgency",
            postgresql.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL", name="urgency_level", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "incident_type",
            postgresql.ENUM(
                "MEDICAL",
                "FIRE",
                "EVACUATION",
                "SHELTER",
                "UTILITIES",
                "OTHER",
                name="incident_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("language_code", sa.String(length=8), nullable=False, server_default="en"),
        sa.Column("location_summary", sa.String(length=280), nullable=False),
        sa.Column("needs_summary", sa.Text(), nullable=False),
        sa.Column("latest_public_update", sa.Text(), nullable=True),
        sa.Column("reporter_name", sa.String(length=120), nullable=True),
        sa.Column("reporter_email", sa.String(length=320), nullable=True),
        sa.Column("reporter_phone", sa.String(length=40), nullable=True),
        sa.Column("assigned_staff_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_cases_case_code", "cases", ["case_code"], unique=True)

    op.create_table(
        "case_share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "scope",
            postgresql.ENUM("STATUS_ONLY", name="share_link_scope", create_type=False),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_case_share_links_case_id", "case_share_links", ["case_id"], unique=False)
    op.create_index("ix_case_share_links_token_hash", "case_share_links", ["token_hash"], unique=True)

    op.create_table(
        "case_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "action_type",
            postgresql.ENUM("NOTE", "STATUS_CHANGE", "CLAIM", "REASSIGN", name="case_action_type", create_type=False),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "from_status",
            postgresql.ENUM(
                "PENDING_REVIEW",
                "ACTIVE",
                "WAITING_FOR_INFORMATION",
                "SAFE_RESOLVED",
                "CLOSED",
                name="case_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            postgresql.ENUM(
                "PENDING_REVIEW",
                "ACTIVE",
                "WAITING_FOR_INFORMATION",
                "SAFE_RESOLVED",
                "CLOSED",
                name="case_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("target_staff_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_case_actions_case_id", "case_actions", ["case_id"], unique=False)
    op.create_index("ix_case_actions_actor_user_id", "case_actions", ["actor_user_id"], unique=False)

    op.create_table(
        "audit_log_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "actor_type",
            postgresql.ENUM(
                "ANONYMOUS",
                "STAFF",
                "SYSTEM",
                name="audit_actor_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("share_link_id", sa.Integer(), sa.ForeignKey("case_share_links.id"), nullable=True),
        sa.Column(
            "event_type",
            postgresql.ENUM(
                "MAGIC_LINK_REQUESTED",
                "MAGIC_LINK_VERIFIED",
                "SESSION_CREATED",
                "CASE_SUBMITTED",
                "CASE_VIEWED",
                "CASE_ACTION_CREATED",
                "SHARE_LINK_CREATED",
                "SHARE_LINK_VIEWED",
                name="audit_event_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_log_entries_actor_user_id", "audit_log_entries", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_log_entries_case_id", "audit_log_entries", ["case_id"], unique=False)
    op.create_index("ix_audit_log_entries_share_link_id", "audit_log_entries", ["share_link_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_audit_log_entries_share_link_id", table_name="audit_log_entries")
    op.drop_index("ix_audit_log_entries_case_id", table_name="audit_log_entries")
    op.drop_index("ix_audit_log_entries_actor_user_id", table_name="audit_log_entries")
    op.drop_table("audit_log_entries")

    op.drop_index("ix_case_actions_actor_user_id", table_name="case_actions")
    op.drop_index("ix_case_actions_case_id", table_name="case_actions")
    op.drop_table("case_actions")

    op.drop_index("ix_case_share_links_token_hash", table_name="case_share_links")
    op.drop_index("ix_case_share_links_case_id", table_name="case_share_links")
    op.drop_table("case_share_links")

    op.drop_index("ix_cases_case_code", table_name="cases")
    op.drop_table("cases")

    op.drop_index("ix_staff_sessions_user_id", table_name="staff_sessions")
    op.drop_index("ix_staff_sessions_token_hash", table_name="staff_sessions")
    op.drop_table("staff_sessions")

    audit_event_type.drop(bind, checkfirst=True)
    audit_actor_type.drop(bind, checkfirst=True)
    case_action_type.drop(bind, checkfirst=True)
    share_link_scope.drop(bind, checkfirst=True)
    incident_type.drop(bind, checkfirst=True)
    urgency_level.drop(bind, checkfirst=True)
    case_status.drop(bind, checkfirst=True)

