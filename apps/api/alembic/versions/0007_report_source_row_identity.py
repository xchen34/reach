"""Give spreadsheet-backed reports a position-independent identity.

Row numbers shift whenever someone inserts, deletes or sorts a row in the
source sheet, so keying imports on position caused the importer to overwrite a
different person's report. `source_row_key` holds a stable value taken from the
row itself (the Google Forms timestamp).

`source_row_withdrawn_at` records that the backing row is gone, so the report
can be hidden without being destroyed — previously such reports were deleted
outright.
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_report_source_row_identity"
down_revision = "0006_subject_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("source_row_key", sa.String(length=160), nullable=True))
    op.add_column(
        "reports",
        sa.Column("source_row_withdrawn_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_reports_source_row_key", "reports", ["source_row_key"])

    # Backfill existing Google Sheets reports from the timestamp already captured
    # in raw_answers_json, so the first import after this migration matches them
    # instead of creating duplicates.
    op.execute(
        """
        UPDATE reports
        SET source_row_key = raw_answers_json -> 'raw_row' ->> 'Horodateur'
        WHERE source_channel = 'GOOGLE_FORM'
          AND raw_answers_json -> 'raw_row' ->> 'Horodateur' IS NOT NULL
          AND raw_answers_json -> 'raw_row' ->> 'Horodateur' <> ''
        """
    )
    # Some sheets label the column "Timestamp" instead.
    op.execute(
        """
        UPDATE reports
        SET source_row_key = raw_answers_json -> 'raw_row' ->> 'Timestamp'
        WHERE source_channel = 'GOOGLE_FORM'
          AND source_row_key IS NULL
          AND raw_answers_json -> 'raw_row' ->> 'Timestamp' IS NOT NULL
          AND raw_answers_json -> 'raw_row' ->> 'Timestamp' <> ''
        """
    )


def downgrade() -> None:
    op.drop_index("ix_reports_source_row_key", table_name="reports")
    op.drop_column("reports", "source_row_withdrawn_at")
    op.drop_column("reports", "source_row_key")
