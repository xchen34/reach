# Incident-scoped Google Forms intake

Reach remains the system of record. Google Forms is only the public intake UI, and the linked Google Sheet is only a temporary raw intake source and backup.

## Manual Google setup

1. Copy the incident-specific missing-person Google Form.
2. Link the form to a private Google Sheet.
3. Share that private Sheet with the read-only Google service-account email.
4. Do not publish the Sheet and do not place the Sheet URL in frontend environment variables.
5. Store the public Google Form `/viewform` URL and the spreadsheet ID in an `incident_intake_sources` row for the Incident.

Add these fields to the form and linked response Sheet:

- `subject_type`
  - English question: `Who is this report about?`
  - French question: `Qui est concerné par ce signalement ?`
  - Chinese question: `本报告涉及的是谁？`
  - Accepted machine values: `person`, `pet`, `unknown`
  - Display choices may be translated as:
    - English: `A person`, `A pet`, `Not sure`
    - French: `Une personne`, `Un animal de compagnie`, `Je ne sais pas`
    - Chinese: `人员`, `宠物`, `不确定`
- `Reach photo attachment code`
  - Optional short code returned by Reach's photo upload section on the public report page.
  - Do not use Google Forms native file upload if it requires reporter Google sign-in.

For the current test setup:

- public form URL: `https://docs.google.com/forms/d/e/1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ/viewform`
- spreadsheet ID: `1EILq0xRcEhXziEtvHTV3agkAl2hiDrUVVfaHz_vYGmw`
- sheet name: use the tab title from the linked response Sheet, commonly `Form Responses 1`

## Backend environment

Set these only for the FastAPI backend:

```bash
Reach_GOOGLE_SHEETS_IMPORT_ENABLED=true
Reach_GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", "...":"..."}'
```

The service account needs read-only access to the private Sheet.

The service-account JSON is read as raw JSON from `Reach_GOOGLE_SERVICE_ACCOUNT_JSON`.
The current implementation does not read a file path and does not decode base64.
The Sheet identifier used by the importer is the tab title stored as `incident_intake_sources.google_sheet_name`; it is not a worksheet index or gid.

## Reach configuration

Create one `incidents` row for the active response and one `incident_intake_sources` row that belongs to that Incident.

The Incident-specific public Google Form URL is stored in:

```text
incident_intake_sources.google_form_url
```

The private spreadsheet configuration is stored in:

```text
incident_intake_sources.google_spreadsheet_id
incident_intake_sources.google_sheet_name
```

Do not put Google service-account JSON, private Sheet URLs, spreadsheet IDs, or Sheet credentials in `NEXT_PUBLIC_*` variables.

For local development, bootstrap the demo Incident and intake source with:

```bash
cd apps/api
python3 -m app.scripts.bootstrap_demo_incident --sheet-name "Form Responses 1"
```

For Docker Compose development:

```bash
docker compose -f infra/docker-compose.yml exec -T api \
  python -m app.scripts.bootstrap_demo_incident --sheet-name "Form Responses 1"
```

The bootstrap upserts the active `reach-demo` Incident and one active Google Sheets intake source. It is safe to run repeatedly and refuses to run when `Reach_APP_ENV=production`.

The public route is:

```text
/incidents/{incident_slug}/report
```

The localized route is:

```text
/{locale}/incidents/{incident_slug}/report
```

The browser receives the Incident display fields and public Google Form URL only. It does not receive the spreadsheet ID, Sheet URL, or Google credentials.

## Importing rows

A coordinator triggers import with:

```text
POST /staff/incidents/{incident_id}/intake-sources/{source_id}/import
```

That coordinator-only endpoint is the manual administrative fallback. Public
Google Form submissions should not rely on a volunteer or coordinator pressing
Sync sheet before the dashboard sees them.

For near-immediate imports, install the Apps Script in
`docs/google-form-apps-script-example.js` as an `On form submit` trigger on the
response spreadsheet. The trigger calls:

```text
POST /ingest/sync-intake
x-beacon-ingest-token: <Reach_GOOGLE_FORM_INGEST_TOKEN>
```

The endpoint is not a staff action and does not require a coordinator session.
It only uses the shared ingest token to tell Reach to pull all active Google
Sheets intake sources through the normal importer. The importer records the
audit actor as `system`.

The background safety-net poll is controlled by:

```bash
Reach_INTAKE_AUTO_SYNC_ENABLED=true
Reach_INTAKE_AUTO_SYNC_INTERVAL_SECONDS=300
```

The poll is intentionally a fallback; use the Apps Script trigger when form
submissions need to appear in the staff dashboard quickly.

For local Docker Compose development, run the same import endpoint without manually copying a
Bearer token:

```bash
scripts/import_google_sheets_intake.sh 2 1
```

The helper refuses to run when the API container is configured with `Reach_APP_ENV=production`.
It requests a development magic link for a dedicated local import user, promotes only that local
user to coordinator in PostgreSQL, verifies the magic link, and calls the staff import endpoint.
It does not print the staff session token or Google service-account credentials.

The importer reads rows after `last_imported_row`, maps headers by label, preserves the complete row in `reports.raw_answers_json`, and creates one immutable Report per new non-empty row. It does not create a Case.

Missing `subject_type` values import as `unknown`. The importer never infers `pet` from narrative text.

When `Reach photo attachment code` is present, the importer links matching Reach-uploaded images to the new Report. Linking is idempotent: re-importing the same row does not duplicate reports or attachment links. Unknown attachment codes are reported as import warnings and do not fail the whole import.

Staff still review each imported Report and decide whether to create a new Case, link an existing Case, mark it out of scope, or mark it invalid or insufficient.

When intake closes, set the Incident status to `intake_paused`, `closed`, or `archived`, or deactivate the intake source.

## Optional Reach photo uploads

The public incident report page includes an optional Reach-owned image upload section next to the embedded Google Form.

MVP flow:

1. The reporter uploads zero or more photos through Reach.
2. Reach returns a short photo attachment code.
3. The reporter enters that code in the Google Form field named `Reach photo attachment code`.
4. The Google Sheets importer links the uploaded images to the imported Report.
5. When staff creates or links a Case from that Report, the attachment metadata is associated with the Case for staff workflows.

Local storage is controlled by:

```bash
Reach_REPORT_ATTACHMENT_STORAGE_DIR=/tmp/Reach/report_attachments
Reach_REPORT_ATTACHMENT_MAX_UPLOAD_BYTES=8388608
Reach_REPORT_ATTACHMENT_MAX_FILES=4
```

Accepted image types are JPEG, PNG, and WebP. The API validates file signatures, not only extensions, and rejects SVG, HTML, executable, arbitrary, empty, oversized, or mismatched uploads. Uploaded image bytes are stored on the filesystem, not in PostgreSQL, and storage keys/local paths are never exposed through public board responses.

Public board behavior:

- staff can see attachment metadata and staff-only image previews;
- public board cards use the first linked image whose storage file exists;
- seed/demo records are backfilled with local curated raster avatars;
- public image URLs are mediated by the backend attachment endpoint.

Production storage should use a private object store or equivalent backend storage. Public image serving should remain mediated by Reach or by non-guessable, policy-controlled signed URLs. Do not expose staff-only originals through predictable public paths.
