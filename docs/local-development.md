# Local Development

## Prerequisites

- Docker
- Docker Compose

## Startup

Run:

```bash
make up
```

Apply migrations when you start a fresh database or after pulling backend schema changes:

```bash
make migrate
```

Then start the web app on the host machine:

```bash
make web
```

You do not need to run `make migrate` every single time. Use it when:

- you started from an empty database
- you pulled changes that include Alembic migrations
- the API fails because a table or column is missing

## Services

- Web: `http://127.0.0.1:3000`
- API: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

Magic-link URLs should resolve to the web app origin (`http://127.0.0.1:3000`).
The backend uses `Reach_MAGIC_LINK_BASE_URL` to build the link that the browser
opens after staff request a sign-in email.

## Interface Language

The active MVP UI is Chinese-only while the volunteer workflow is being finalized. English and French locale files remain in the codebase for later reuse, but the visible app does not expose language switching.

## Configure Environment

Create a local `.env` at the repository root from the example:

```bash
cp .env.example .env
```

The host-run frontend loads this root `.env` through `make web`. Docker Compose reads the same root `.env` for variable interpolation, and the API container receives only variables explicitly forwarded in `infra/docker-compose.yml`.

## Configure Incident Google Sheets Intake

Incident-scoped intake no longer uses three global public form URLs as the source of truth. The public Incident page reads the form URL from `incident_intake_sources.google_form_url`, and the backend importer reads the private spreadsheet ID and tab name from `incident_intake_sources.google_spreadsheet_id` and `incident_intake_sources.google_sheet_name`.

Set these backend-only values in `.env` when you want to import from Google Sheets:

```dotenv
Reach_GOOGLE_SHEETS_IMPORT_ENABLED=true
Reach_GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
Reach_DEMO_GOOGLE_SHEET_NAME=Form Responses 1
```

Keep the service-account JSON as one-line raw JSON. Do not put Google credentials in any `NEXT_PUBLIC_*` variable.

`Reach_GOOGLE_FORM_INGEST_TOKEN` and `NEXT_PUBLIC_SAFE_REPORT_FORM_URL`, `NEXT_PUBLIC_MISSING_REPORT_FORM_URL`, and `NEXT_PUBLIC_UPDATE_REPORT_FORM_URL` remain legacy compatibility settings for the old Apps Script ingest and homepage form links. They are not required for the Incident-scoped Google Sheets importer.

See [incident-google-sheets-intake.md](incident-google-sheets-intake.md) for the Incident and intake-source database setup.

To create or update the local demo Incident and its Google Sheets intake source, run one of:

```bash
cd apps/api
python3 -m app.scripts.bootstrap_demo_incident --sheet-name "Form Responses 1"
```

```bash
docker compose -f infra/docker-compose.yml exec -T api \
  python -m app.scripts.bootstrap_demo_incident --sheet-name "Form Responses 1"
```

The command is idempotent. It creates or updates the active `reach-demo` Incident and its active Google Sheets intake source without storing Google credentials.

After bootstrapping, verify the public Incident configuration:

```bash
curl -s http://127.0.0.1:8000/incidents/reach-demo/report
```

Open the frontend page:

```text
http://127.0.0.1:3000/incidents/reach-demo/report
```

## Why web runs on the host by default

For this project, the most stable development setup is:

- Docker for `db` and `api`
- host machine for `web`

Running Next.js dev inside the Docker `web` service and also on the host can corrupt `.next` and cause broken chunk/manifest errors. The compose file now keeps `web` behind an opt-in profile so it does not start by default.

If you explicitly want the frontend in Docker, run:

```bash
docker compose -f infra/docker-compose.yml --profile web up -d web
```

Do not run host `npm run dev` at the same time as Docker `web`.

## Stop and reset

Stop Docker services:

```bash
make down
```

Stop Docker services and clear host Next.js cache:

```bash
make reset
```

Stop Docker services, remove Docker volumes, and clear host Next.js cache:

```bash
make reset-all
```

## Voice intake storage

Phase 1.5 stores uploaded audio in a Docker volume mounted only into the API container:

- Docker volume: `voice_uploads_data`
- In-container path: `/app/data/voice_uploads`

Uploaded media is not stored in PostgreSQL and is not written into the Git checkout. The current speech-to-text integration is a development stub behind a provider abstraction, so the stored audio and transcript state can be exercised locally without locking the project to a production speech vendor yet.

## Development magic links

Request a magic link through:

```bash
curl -X POST http://localhost:8000/auth/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"volunteer@example.com"}'
```

In development mode, the generated login URL is returned in the API response and logged by the API container.

Verify the link and create a bearer session with:

```bash
curl -X POST http://localhost:8000/auth/verify-magic-link \
  -H "Content-Type: application/json" \
  -d '{"token":"SIGNED_TOKEN_FROM_LOGIN_URL"}'
```

The checked-in Phase 1 API contract is available at `docs/openapi.yaml`.
