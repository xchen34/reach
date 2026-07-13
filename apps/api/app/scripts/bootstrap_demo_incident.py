from __future__ import annotations

import argparse
import os
import sys

from app.config import get_settings
from app.db import SessionLocal
from app.services.dev_bootstrap import bootstrap_demo_incident


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or update the local reach-demo Incident and Google Sheets intake source.",
    )
    parser.add_argument(
        "--sheet-name",
        default=os.environ.get("Reach_DEMO_GOOGLE_SHEET_NAME", ""),
        help="Google Sheets tab title, for example 'Form Responses 1'. "
        "Can also be set with Reach_DEMO_GOOGLE_SHEET_NAME.",
    )
    args = parser.parse_args()

    settings = get_settings()
    if settings.app_env.lower() == "production":
        print("Refusing to bootstrap demo Incident while Reach_APP_ENV=production.", file=sys.stderr)
        return 2

    if not args.sheet_name.strip():
        print(
            "Missing Google sheet tab title. Pass --sheet-name or set Reach_DEMO_GOOGLE_SHEET_NAME.",
            file=sys.stderr,
        )
        return 2

    with SessionLocal() as db:
        result = bootstrap_demo_incident(db, google_sheet_name=args.sheet_name)

    print("Demo Incident bootstrap complete.")
    print(f"incident_id={result.incident_id}")
    print(f"intake_source_id={result.intake_source_id}")
    print(f"slug={result.slug}")
    print(f"google_sheet_name={result.google_sheet_name}")
    print(f"incident_created={str(result.incident_created).lower()}")
    print(f"intake_source_created={str(result.intake_source_created).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
