"""Let staff withdraw a case without asserting something about a person.

Nothing could hide a case. The only ways one left the queue were merging it into
a real duplicate, or marking it safe or deceased — so removing a test record or a
case created by mistake meant falsely claiming someone had been found, and
publishing that to the public board.

Withdrawal is deliberately separate from CaseHandlingStatus.ARCHIVED, which
mark_safe already sets: overloading it would make "withdrawn" and "resolved and
archived" indistinguishable.
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_case_withdrawal"
down_revision = "0008_intake_last_imported_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("withdrawn_reason", sa.String(length=400), nullable=True))
    op.add_column("cases", sa.Column("withdrawn_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "cases_withdrawn_by_user_id_fkey", "cases", "users", ["withdrawn_by_user_id"], ["id"]
    )
    op.create_index("ix_cases_withdrawn_at", "cases", ["withdrawn_at"])


def downgrade() -> None:
    op.drop_index("ix_cases_withdrawn_at", table_name="cases")
    op.drop_constraint("cases_withdrawn_by_user_id_fkey", "cases", type_="foreignkey")
    op.drop_column("cases", "withdrawn_by_user_id")
    op.drop_column("cases", "withdrawn_reason")
    op.drop_column("cases", "withdrawn_at")
