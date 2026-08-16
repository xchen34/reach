# Reach Architecture

Reach is a small case-management system for community missing-person and
missing-pet coordination.

## Runtime Pieces

- `apps/web`: Next.js app for public pages, public board, staff login, staff
  dashboard, case/report detail pages, and the browser API proxy.
- `apps/api`: FastAPI app for auth, reports, cases, staff actions, board data,
  attachment access, Google Sheets import, and voice-intake foundations.
- `infra`: Docker Compose and Dockerfiles for local PostgreSQL, API, and
  optional web service.
- `docs/openapi.yaml`: checked-in OpenAPI snapshot.

## Main Data Flow

```text
Google Form
→ linked Google Sheet
→ Apps Script /ingest/sync-intake trigger
→ FastAPI Google Sheets importer
→ Report
→ staff review
→ Case
→ public board when status is public-safe
```

Manual Sheet import is available only to coordinators. Normal form submissions
should use the system webhook and background poll.

## Auth

Staff sign in with magic links. In development, links are returned in the API
response and logs. Staff API routes use bearer sessions. Users have either
`volunteer` or `coordinator` role.

## Reports And Cases

- `Report` preserves imported source intake.
- Staff can create a new `Case`, link a report to an existing case, mark a
  report out of scope, mark it invalid/insufficient, or add notes.
- `Case` is the durable follow-up task shown in staff workflows and, when
  appropriate, on the public board.

## Public Board

The public board is derived from cases. It hides pending/unassigned/withdrawn
records and currently shows:

- in progress follow-up
- found safe
- confirmed deceased

Reporter contact data, internal notes, Sheet metadata, and staff-only details
are never part of public board responses.

## Attachments

Public reporters can upload images to Reach and copy the returned attachment
code into the Google Form. The Sheet importer links matching codes to reports.
When a report becomes or links to a case, those attachments are available in
staff views and as the case image shown on the public board.

Uploads are stored on the filesystem in local development, not in PostgreSQL.
Production should use private object storage or an equivalent backend storage
layer.

## Voice Intake

Voice intake exists as a bounded foundation: anonymous upload, stored audio,
development speech-to-text stub, user-confirmed transcript, and staff-only
retrieval after attachment to a case. It does not infer safety or provide
emergency advice.
