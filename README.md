# Reach

Reach is a minimal crisis-community coordination app for missing persons and
missing pets reports.

It is not an emergency dispatch system. It does not contact emergency services
and must not be presented as a substitute for calling official responders.

## Current Product Shape

- Public intake happens through Google Forms.
- Google Sheets rows are imported into Reach as staff-reviewable reports.
- Staff review reports, create or link follow-up cases, add notes, assign work,
  and mark outcomes.
- The public board shows only selected case categories: being followed up, found
  safe, and confirmed deceased.
- Seed/demo records use local curated raster avatars for people and pets.

## Stack

- Frontend: Next.js + TypeScript in `apps/web`
- Backend: FastAPI + Python in `apps/api`
- Database: PostgreSQL + Alembic
- Local infra: Docker Compose in `infra/docker-compose.yml`

## Key Flows

### Form Submission To Dashboard

For real Google Forms, the intended automatic flow is:

```text
Google Form submit
→ response row appears in Google Sheet
→ Apps Script onFormSubmit calls /ingest/sync-intake
→ Reach pulls active Google Sheets intake sources
→ new report appears in the staff dashboard
```

The manual staff import endpoint is a coordinator-only fallback:

```text
POST /staff/incidents/{incident_id}/intake-sources/{source_id}/import
```

Volunteers should not need to press Sync sheet for normal submissions.

### Public Board

The public board is derived from internal cases. It does not show every staff
queue item. It currently exposes only:

- `being_followed_up`
- `found_safe`
- `found_dead`

## Local Development

Start database and API:

```bash
make up
make migrate
```

Start the frontend:

```bash
make web
```

Open:

- App: `http://127.0.0.1:3000/`
- Public board: `http://127.0.0.1:3000/board`
- Staff login: `http://127.0.0.1:3000/staff/login`
- API docs: `http://127.0.0.1:8000/docs`

Stop local services:

```bash
make down
```

## Google Form Automatic Sync

Set these backend env vars in local `.env`, Docker, or Railway:

```env
Reach_GOOGLE_SHEETS_IMPORT_ENABLED=true
Reach_GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
Reach_GOOGLE_FORM_INGEST_TOKEN=some-long-random-secret
Reach_INTAKE_AUTO_SYNC_ENABLED=true
Reach_INTAKE_AUTO_SYNC_INTERVAL_SECONDS=300
```

Install the Apps Script from:

```text
docs/google-form-apps-script-example.js
```

Configure it with:

```js
var Reach_HOST = "https://YOUR-API-HOST";
var Reach_INGEST_TOKEN = "same-value-as-Reach_GOOGLE_FORM_INGEST_TOKEN";
```

Then add an Apps Script trigger:

- Function: `onFormSubmit`
- Event source: `From spreadsheet`
- Event type: `On form submit`

The background poll is a safety net. The Apps Script trigger is what makes new
submissions show up quickly.

## Useful Commands

Backend checks:

```bash
PYTHONPATH="$(pwd)/apps/api" python3 -m pytest
PYTHONPYCACHEPREFIX=/tmp/reach-pycache python3 -m compileall apps/api/app apps/api/tests
```

Frontend checks:

```bash
cd apps/web
npm run lint
npm run typecheck
npm run build
```

Seed/demo photos:

```bash
docker compose -f infra/docker-compose.yml exec -T api \
  python -m app.scripts.backfill_seed_demo_photos --refresh-backfilled
```

## More Documentation

- `docs/local-development.md`
- `docs/railway-deployment.md`
- `docs/incident-google-sheets-intake.md`
- `docs/google-form-column-mapping.md`
- `docs/architecture.md`
- `docs/volunteer-task-workflow.md`
