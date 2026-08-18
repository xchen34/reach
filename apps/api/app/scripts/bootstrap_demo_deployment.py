"""Bootstrap a hosted demo deployment with synthetic data.

This is intended for one-off Railway demo initialization after migrations have
run against a fresh database.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models.enums import StaffRole
from app.models.user import User
from app.scripts.seed_demo_records import (
    clear_existing_seed,
    create_seed_records,
    empty_photo_asset_pool,
)
from app.services.dev_bootstrap import bootstrap_demo_incident


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a coordinator user, demo Incident, and synthetic public-board data.",
    )
    parser.add_argument(
        "--coordinator-email",
        required=True,
        help="Email address allowed to request staff magic links.",
    )
    parser.add_argument(
        "--seed-count",
        type=int,
        default=40,
        help="Synthetic demo reports to create. Use 0 to skip demo records.",
    )
    parser.add_argument(
        "--sheet-name",
        default="Form Responses 1",
        help="Google Sheets tab name for the demo Incident intake source.",
    )
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Do not remove previous synthetic DCASE/DREP demo records first.",
    )
    args = parser.parse_args()

    email = args.coordinator_email.strip().lower()
    if "@" not in email:
        print("--coordinator-email must be a valid email address.", file=sys.stderr)
        return 2
    if args.seed_count != 0 and args.seed_count < 20:
        print("--seed-count must be 0 or at least 20.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        user_created = user is None
        if user is None:
            user = User(email=email, role=StaffRole.COORDINATOR, is_active=True)
            db.add(user)
            db.flush()
        else:
            user.role = StaffRole.COORDINATOR
            user.is_active = True

        incident_result = bootstrap_demo_incident(db, google_sheet_name=args.sheet_name)

        removed = 0
        created = {"reports": 0, "cases": 0, "attachments": 0}
        if args.seed_count:
            if not args.keep_existing:
                removed = clear_existing_seed(db)
            created = create_seed_records(
                db,
                incident_result.incident_id,
                user.id,
                args.seed_count,
                photo_assets=empty_photo_asset_pool(),
            )
        db.commit()

    print("Demo deployment bootstrap complete.")
    print(f"coordinator_email={email}")
    print(f"coordinator_created={str(user_created).lower()}")
    print(f"incident_slug={incident_result.slug}")
    print(f"removed_previous_records={removed}")
    print(f"created_reports={created['reports']}")
    print(f"created_cases={created['cases']}")
    print(f"created_attachments={created['attachments']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
