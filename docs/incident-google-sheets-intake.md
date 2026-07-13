# Incident-scoped Google Forms intake

Reach remains the system of record. Google Forms is only the public intake UI, and the linked Google Sheet is only a temporary raw intake source and backup.

## Manual Google setup

1. Copy the incident-specific missing-person Google Form.
2. Link the form to a private Google Sheet.
3. Share that private Sheet with the read-only Google service-account email.
4. Do not publish the Sheet and do not place the Sheet URL in frontend environment variables.
5. Store the public Google Form `/viewform` URL and the spreadsheet ID in an `incident_intake_sources` row for the Incident.

For the current test setup:

- public form URL: `https://docs.google.com/forms/d/e/1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ/viewform`
- spreadsheet ID: `1EILq0xRcEhXziEtvHTV3agkAl2hiDrUVVfaHz_vYGmw`
- sheet name: use the tab name from the linked response Sheet, commonly `Form Responses 1`

## Backend environment

Set these only for the FastAPI backend:

```bash
Reach_GOOGLE_SHEETS_IMPORT_ENABLED=true
Reach_GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account", "...":"..."}'
```

The service account needs read-only access to the private Sheet.

## Reach configuration

Create one `incidents` row for the active response and one `incident_intake_sources` row that belongs to that Incident.

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

The importer reads rows after `last_imported_row`, maps headers by label, preserves the complete row in `reports.raw_answers_json`, and creates one immutable Report per new non-empty row. It does not create a Case.

Staff still review each imported Report and decide whether to create a new Case, link an existing Case, mark it out of scope, or mark it invalid or insufficient.

When intake closes, set the Incident status to `intake_paused`, `closed`, or `archived`, or deactivate the intake source.
