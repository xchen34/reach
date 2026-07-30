#!/usr/bin/env bash

set -euo pipefail

API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:8000}"
INGEST_TOKEN="${Reach_GOOGLE_FORM_INGEST_TOKEN:-}"

if [[ -z "${INGEST_TOKEN}" ]]; then
  echo "Reach_GOOGLE_FORM_INGEST_TOKEN is empty. Set it in .env before running seed-demo."
  exit 1
fi

post_report() {
  local payload="$1"
  curl -fsS -X POST "${API_BASE_URL}/ingest/google-form" \
    -H "content-type: application/json" \
    -H "x-Reach-ingest-token: ${INGEST_TOKEN}" \
    --data "${payload}" >/dev/null
}

echo "Seeding fictional community coordination demo data into ${API_BASE_URL} ..."

post_report '{
  "report_kind":"missing",
  "location_summary":"Tower 2 lobby near the lifts",
  "details_summary":"Family members cannot reach Ms. Chan after the building fire alarm and evacuation.",
  "language_code":"en",
  "urgency":"high",
  "incident_type":"fire",
  "reporter_name":"Family contact",
  "reporter_phone":"+852 5555 0101",
  "subject_name":"Ms. Chan",
  "public_update_hint":"Missing-person report received. Volunteers are verifying her last known location.",
  "source_relationship":"family_friend",
  "callback_allowed":true,
  "public_visibility_requested":true,
  "source_form_name":"Missing Person Form",
  "source_entry_id":"demo-missing-001"
}'

post_report '{
  "report_kind":"update",
  "location_summary":"Registration desk at the temporary shelter",
  "details_summary":"A volunteer believes Ms. Chan may have checked in briefly but the shelter list still needs confirmation.",
  "language_code":"en",
  "urgency":"medium",
  "incident_type":"shelter",
  "reporter_name":"Shelter volunteer",
  "subject_name":"Ms. Chan",
  "public_update_hint":"Possible shelter sighting reported. Waiting for confirmation.",
  "source_relationship":"community_member",
  "callback_allowed":true,
  "public_visibility_requested":true,
  "update_category":"missing_lead",
  "source_form_name":"Update Lead Form",
  "source_entry_id":"demo-update-001"
}'

post_report '{
  "report_kind":"safe",
  "location_summary":"Community hall relief station",
  "details_summary":"Mr. Wong reported himself safe and asked volunteers to let neighbors know he reached the relief station.",
  "language_code":"en",
  "urgency":"low",
  "incident_type":"shelter",
  "reporter_name":"Mr. Wong",
  "reporter_phone":"+852 5555 0102",
  "subject_name":"Mr. Wong",
  "public_update_hint":"Resident confirmed safe at the relief station.",
  "source_relationship":"self",
  "callback_allowed":false,
  "public_visibility_requested":true,
  "source_form_name":"Safe Check-In Form",
  "source_entry_id":"demo-safe-001"
}'

post_report '{
  "report_kind":"missing",
  "location_summary":"Block C stairwell exit",
  "details_summary":"Neighbors are trying to locate an elderly couple from the upper floors after evacuation.",
  "language_code":"en",
  "urgency":"critical",
  "incident_type":"fire",
  "reporter_name":"Block volunteer",
  "reporter_email":"volunteer@example.com",
  "subject_name":"Lam household",
  "public_update_hint":"Elderly household still unconfirmed after evacuation. Priority follow-up required.",
  "source_relationship":"community_member",
  "callback_allowed":true,
  "public_visibility_requested":true,
  "source_form_name":"Missing Person Form",
  "source_entry_id":"demo-missing-002"
}'

post_report '{
  "report_kind":"update",
  "location_summary":"Supply table outside the school shelter",
  "details_summary":"Community volunteers confirmed bottled water, masks, and phone charging are available at the shelter.",
  "language_code":"en",
  "urgency":"low",
  "incident_type":"utilities",
  "reporter_name":"Supply coordinator",
  "subject_name":"School shelter supply point",
  "public_update_hint":"Shelter supplies available: water, masks, and charging support.",
  "source_relationship":"on_site",
  "callback_allowed":true,
  "public_visibility_requested":true,
  "update_category":"resource_update",
  "source_form_name":"Update Lead Form",
  "source_entry_id":"demo-update-002"
}'

post_report '{
  "report_kind":"safe",
  "location_summary":"North playground assembly area",
  "details_summary":"A parent confirmed two children from Unit 8B were reunited with family at the assembly point.",
  "language_code":"en",
  "urgency":"medium",
  "incident_type":"evacuation",
  "reporter_name":"Parent group volunteer",
  "subject_name":"Unit 8B children",
  "public_update_hint":"Children from Unit 8B confirmed reunited with family.",
  "source_relationship":"family_friend",
  "callback_allowed":true,
  "public_visibility_requested":true,
  "source_form_name":"Safe Check-In Form",
  "source_entry_id":"demo-safe-002"
}'

echo "Seed complete."
echo "Next:"
echo "  1. Open http://127.0.0.1:3000/board"
echo "  2. Open http://127.0.0.1:3000/staff/login"
echo "  3. Sign in with any email, for example volunteer@example.com"
