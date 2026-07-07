"""initial auth foundation

Revision ID: 0001_initial_auth_foundation
Revises: 
Create Date: 2026-07-07 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial_auth_foundation"
down_revision = None
branch_labels = None
depends_on = None


staff_role = postgresql.ENUM("VOLUNTEER", "COORDINATOR", name="staff_role")
staff_role_existing = postgresql.ENUM(
    "VOLUNTEER",
    "COORDINATOR",
    name="staff_role",
    create_type=False,
)


def upgrade() -> None:
    staff_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", staff_role_existing, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "magic_link_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("signed_token", sa.String(length=512), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_magic_link_tokens_token_hash", "magic_link_tokens", ["token_hash"], unique=True)
    op.create_index("ix_magic_link_tokens_user_id", "magic_link_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_magic_link_tokens_user_id", table_name="magic_link_tokens")
    op.drop_index("ix_magic_link_tokens_token_hash", table_name="magic_link_tokens")
    op.drop_table("magic_link_tokens")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    staff_role.drop(op.get_bind(), checkfirst=True)
