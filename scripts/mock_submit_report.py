#!/usr/bin/env python3
import json
import sys
import urllib.request
import urllib.error
import random
from datetime import datetime

def print_help():
    print("Usage: python3 scripts/mock_submit_report.py [options]")
    print("Options:")
    print("  --kind <safe|missing|update>   Default: missing")
    print("  --name <subject_name>          Default: tester")
    print("  --location <location>          Default: Residence Colonie, Block B lobby")
    print("  --details <details>            Default: Testing report ingestion in local development.")
    print("  --attachment <code_string>     Optional, attachment code from photo upload")
    print("  --reporter <name>              Default: Test Reporter")

def main():
    args = sys.argv[1:]
    if "--help" in args or "-h" in args:
        print_help()
        sys.exit(0)

    # Defaults
    report_kind = "missing"
    subject_name = "tester"
    location_summary = "Residence Colonie, Block B lobby"
    details_summary = "Testing report ingestion in local development."
    attachment_code = None
    reporter_name = "Test Reporter"

    # Parse arguments
    try:
        if "--kind" in args:
            report_kind = args[args.index("--kind") + 1]
        if "--name" in args:
            subject_name = args[args.index("--name") + 1]
        if "--location" in args:
            location_summary = args[args.index("--location") + 1]
        if "--details" in args:
            details_summary = args[args.index("--details") + 1]
        if "--attachment" in args:
            attachment_code = args[args.index("--attachment") + 1]
        if "--reporter" in args:
            reporter_name = args[args.index("--reporter") + 1]
    except IndexError:
        print("Error: Missing value for one of the arguments.")
        sys.exit(1)

    url = "http://127.0.0.1:8000/ingest/google-form"
    token = "local-dev-ingest-token"

    payload = {
        "report_kind": report_kind,
        "location_summary": location_summary,
        "details_summary": details_summary,
        "language_code": "en",
        "reporter_name": reporter_name,
        "reporter_email": "tester@example.com",
        "reporter_phone": "+33612345678",
        "subject_name": subject_name,
        "subject_type": "pet" if "pet" in details_summary.lower() else "person",
        "attachment_code": attachment_code,
        "source_relationship": "family_friend",
        "callback_allowed": True,
        "public_visibility_requested": True,
        "source_form_id": "form-local-dev-mock",
        "source_form_name": "Local Dev Simulator",
        "source_entry_id": f"mock-entry-{random.randint(100000, 999999)}",
        "submitted_at": datetime.utcnow().isoformat() + "Z"
    }

    print("=== MOCK REPORT SUBMISSION SIMULATOR ===")
    print(f"Submitting payload to {url}...")
    print(json.dumps(payload, indent=2))

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-beacon-ingest-token": token
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            res_data = json.loads(res_body)
            print("\n✅ SUCCESS: Report mock submitted successfully!")
            print(f"Report ID: {res_data.get('id')}")
            print(f"Report Code: {res_data.get('report_code')}")
            print(f"Status: {res_data.get('triage_status')}")
            print("You can now refresh the staff backend page to see it in the queue.")
    except urllib.error.HTTPError as e:
        print(f"\n❌ ERROR: API request failed with status code {e.code}")
        print(e.read().decode("utf-8"))
    except Exception as e:
        print(f"\n❌ ERROR: Connection failed: {e}")

if __name__ == "__main__":
    main()
