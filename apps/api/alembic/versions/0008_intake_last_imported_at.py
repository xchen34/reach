"""Record when an intake source was last imported.

The dashboard needs to tell staff how stale the queue is. `updated_at` moves for
any edit to the row, so it cannot answer "when did we last pull the sheet".
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_intake_last_imported_at"
down_revision = "0007_report_source_row_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "incident_intake_sources",
        sa.Column("last_imported_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Best available approximation for sources that have already imported rows.
    op.execute(
        """
        UPDATE incident_intake_sources
        SET last_imported_at = updated_at
        WHERE last_imported_row > 1
        """
    )


def downgrade() -> None:
    op.drop_column("incident_intake_sources", "last_imported_at")
