# Reach

Reach is a community coordination app for crisis scenarios.

Reach began as a personal attempt to learn from a moment when technology felt genuinely meaningful.

The project is inspired by the IT volunteers who helped coordinate information during the Hong Kong Wang Fuk Court fire. Watching people use simple digital tools to collect updates, reduce confusion, and help a distressed community stay connected was deeply moving to me. It showed that technology does not need to be complicated to matter. In the right moment, even a lightweight information workflow can provide real clarity, reassurance, and practical support.

Reach is my attempt to study that model, recreate its core coordination logic, and explore how it could be extended to support a wider range of crisis-response and community-help scenarios.

It is no longer centered on a generic anonymous case form. The current product shape is:

1. public intake happens through Google Forms
2. Reach imports those reports into its internal workflow
3. staff verify, merge, and publish privacy-safe updates
4. the public board shows approved updates

Reach is not an emergency dispatch system. It does not contact emergency services and must not be presented as a substitute for calling official emergency responders.

## What The System Does

Reach currently supports four layers:

- public landing page with links to safe-report, missing-person, and update forms
- backend ingest bridge that maps Google Form submissions into Reach records
- staff review workspace for verification, notes, assignment, publish decisions, and related-record marking
- public board that shows verified status updates derived from internal records

The codebase still uses the term `case` internally because it was built from an earlier case-management MVP. Functionally, the product is already moving toward a community coordination record workflow.

## Repository Layout

- `apps/web`
  Next.js frontend. Public homepage, public board, staff login, staff queue, staff detail, and the internal API proxy used by the browser.
- `apps/api`
  FastAPI backend. Auth, cases, staff routes, audit, board adapter, Google Form ingest bridge, and voice-related foundation.
- `infra`
  Dockerfiles, Docker Compose, example env configuration, and reverse-proxy example files.
- `docs`
  Architecture notes, local development notes, OpenAPI snapshot, Google Form mapping notes, and product-direction notes.

Useful docs already in the repo:

- [docs/architecture.md](/Users/leochen/emergency_companiion/docs/architecture.md)
- [docs/local-development.md](/Users/leochen/emergency_companiion/docs/local-development.md)
- [docs/community-coordination-mvp.md](/Users/leochen/emergency_companiion/docs/community-coordination-mvp.md)
- [docs/google-form-column-mapping.md](/Users/leochen/emergency_companiion/docs/google-form-column-mapping.md)
- [docs/google-form-apps-script-example.js](/Users/leochen/emergency_companiion/docs/google-form-apps-script-example.js)

## Architecture

### Frontend

The frontend is a Next.js app router application.

Main responsibilities:

- render the public landing page
- render the public board
- render staff login, staff queue, and staff detail pages
- keep browser requests pointed at `/api/[...path]` instead of calling the backend container directly
- provide locale-aware routes for `en`, `fr`, and `zh`

Key frontend entry points:

- [apps/web/app/[locale]/page.tsx](/Users/leochen/emergency_companiion/apps/web/app/[locale]/page.tsx)
- [apps/web/components/community-coordination-home.tsx](/Users/leochen/emergency_companiion/apps/web/components/community-coordination-home.tsx)
- [apps/web/app/[locale]/board/page.tsx](/Users/leochen/emergency_companiion/apps/web/app/[locale]/board/page.tsx)
- [apps/web/components/community-board-page.tsx](/Users/leochen/emergency_companiion/apps/web/components/community-board-page.tsx)
- [apps/web/app/[locale]/staff/page.tsx](/Users/leochen/emergency_companiion/apps/web/app/[locale]/staff/page.tsx)
- [apps/web/components/staff-case-list-page.tsx](/Users/leochen/emergency_companiion/apps/web/components/staff-case-list-page.tsx)
- [apps/web/app/[locale]/staff/cases/[caseId]/page.tsx](/Users/leochen/emergency_companiion/apps/web/app/[locale]/staff/cases/[caseId]/page.tsx)
- [apps/web/components/staff-case-detail-page.tsx](/Users/leochen/emergency_companiion/apps/web/components/staff-case-detail-page.tsx)
- [apps/web/app/api/[...path]/route.ts](/Users/leochen/emergency_companiion/apps/web/app/api/%5B...path%5D/route.ts)

### Backend

The backend is a FastAPI app mounted from [apps/api/app/main.py](/Users/leochen/emergency_companiion/apps/api/app/main.py).

Main responsibilities:

- issue and verify development magic links for staff login
- store staff sessions
- persist imported reports in PostgreSQL
- expose staff-only routes for queue, detail, audit, actions, publish workflow, and relation markers
- expose a hidden Google Form ingest route
- expose a hidden public board adapter route

Routers currently included by the app:

- auth
- staff session
- board
- cases
- Google Form ingest
- staff cases
- voice
- share links
- audit

### Database

PostgreSQL is the only database.

The backend persists:

- users
- magic link tokens
- staff sessions
- cases
- case share links
- case actions
- audit log entries
- voice intake records

There is no separate `events` table yet.

The current public board and staff queue are adapters built from `cases` plus audit metadata. That is deliberate: the current phase optimizes for workflow usefulness without forcing a larger schema migration.

### Infra

Local infra is defined in [infra/docker-compose.yml](/Users/leochen/emergency_companiion/infra/docker-compose.yml).

It starts three services:

- `db`
  PostgreSQL 16 on port `5432`
- `api`
  FastAPI + Uvicorn on port `8000`
- `web`
  Next.js dev server on port `3000`

Named Docker volumes:

- `postgres_data`
  persistent PostgreSQL data
- `voice_uploads_data`
  stored audio uploads for the voice flow

Important implication:

- if Docker Compose is running, port `3000` is already owned by the `web` container
- do not also run `cd apps/web && npm run dev` on the host unless you change the port

## Runtime Request Flow

### 1. Public Intake Flow

The public homepage does not submit directly into the Reach database.

Current path:

1. user opens `/`
2. user clicks one of the public actions:
   - safe report
   - missing report
   - update / lead
3. the button opens an external Google Form URL from environment variables
4. Google Form writes into a Google Sheet
5. Apps Script or another bridge process transforms that row into Reach JSON
6. the bridge sends `POST /ingest/google-form` with `x-Reach-ingest-token`
7. Reach creates a `case`, share link, action note, and audit entries

The current homepage component is [apps/web/components/community-coordination-home.tsx](/Users/leochen/emergency_companiion/apps/web/components/community-coordination-home.tsx).

The current hidden ingest route is implemented in:

- [apps/api/app/api/google_forms.py](/Users/leochen/emergency_companiion/apps/api/app/api/google_forms.py)
- [apps/api/app/services/case_service.py](/Users/leochen/emergency_companiion/apps/api/app/services/case_service.py)

### 2. Staff Verification Flow

Once a report has been imported, staff work entirely inside Reach.

Current path:

1. volunteer opens `/staff/login`
2. frontend requests a development magic link
3. backend returns a signed token in development mode
4. frontend verifies the token and stores a bearer access token
5. staff opens `/staff`
6. frontend calls `GET /staff/me`
7. frontend calls `GET /staff/cases/queue`
8. backend groups raw cases into queue cards
9. staff opens a record detail page
10. frontend loads:
    - case detail
    - audit log
    - optional voice detail
    - optional intake review
11. staff can:
    - save internal note
    - claim ownership
    - publish a public update
    - mark another record as related / duplicate / update chain

The queue grouping is currently derived, not normalized.

Current grouping strategy:

- prefer `subject_name` from the `CASE_SUBMITTED` audit metadata
- otherwise fall back to `location_summary + incident_type`

That logic lives in [apps/api/app/services/staff_queue_service.py](/Users/leochen/emergency_companiion/apps/api/app/services/staff_queue_service.py).

### 3. Public Board Flow

The public board is not a separate public database table.

Current path:

1. browser opens `/board`
2. Next.js page fetches `/api/board`
3. the internal Next proxy forwards the request to backend `GET /board`
4. backend reads `cases`
5. backend maps internal `CaseStatus` to board-friendly statuses:
   - `pending_review` -> `unverified`
   - `active` -> `responding`
   - `waiting_for_information` -> `needs_follow_up`
   - `safe_resolved` -> `safe_confirmed`
   - `closed` -> `archived`
6. frontend renders the result as public cards

That mapping lives in [apps/api/app/services/board_service.py](/Users/leochen/emergency_companiion/apps/api/app/services/board_service.py).

### 4. Browser API Proxy Flow

The browser does not call `http://localhost:8000` directly for authenticated app behavior.

Instead:

1. browser calls `/api/...`
2. Next.js route handler checks the path against an allowlist
3. Next.js forwards the request to the backend container
4. auth headers are forwarded when needed

This is implemented in [apps/web/app/api/[...path]/route.ts](/Users/leochen/emergency_companiion/apps/web/app/api/%5B...path%5D/route.ts).

This layer matters because:

- the browser sees one app origin
- the backend container can stay reachable at `http://api:8000` from inside Docker
- the frontend can still use `http://localhost:8000` outside Docker when needed

## Current Product Logic Chain

If you ignore framework details, the product logic is this:

1. collect raw community signals fast
2. normalize them into a single internal record shape
3. let staff verify before publishing
4. keep internal notes and audit history private
5. only publish a short, privacy-safe, public update
6. allow multiple raw reports to be treated as one subject/update chain

That is why the current app has these specific building blocks:

- Google Forms for low-friction intake
- ingest bridge for normalization
- staff queue for triage
- staff detail for human review
- relation markers for duplicates and follow-up chains
- public board for approved summaries

## Environment Variables

### Infra-level variables used by Docker Compose

The compose file already provides defaults for most local development values.

Important ones:

- `Reach_DATABASE_URL`
- `Reach_AUTH_TOKEN_SECRET`
- `Reach_MAGIC_LINK_BASE_URL`
- `Reach_DEV_MAGIC_LINK_MODE`
- `Reach_DEV_DEFAULT_ROLE`
- `Reach_DEV_AUTO_CREATE_USERS`
- `Reach_GOOGLE_FORM_INGEST_TOKEN`
- `Reach_SPEECH_TO_TEXT_PROVIDER`
- `Reach_VOICE_STORAGE_DIR`

Frontend-facing variables:

- `NEXT_PUBLIC_SAFE_REPORT_FORM_URL`
- `NEXT_PUBLIC_MISSING_REPORT_FORM_URL`
- `NEXT_PUBLIC_UPDATE_REPORT_FORM_URL`
- `NEXT_PUBLIC_COMMUNITY_BOARD_URL`
- `NEXT_PUBLIC_ENABLE_STAFF_DASHBOARD_MOCKS`

For examples, see [infra/.env.example](/Users/leochen/emergency_companiion/infra/.env.example).

## Local Development

### Start The Stack

```bash
make up
make migrate
make ps
```

Then start the frontend on the host:

```bash
make web
```

`make migrate` is not required every single time. Use it when:

- the database is new or was reset
- you pulled a branch with new Alembic migrations
- the API reports missing tables or columns

Open:

- web: `http://127.0.0.1:3000/`
- board: `http://127.0.0.1:3000/board`
- staff login: `http://127.0.0.1:3000/staff/login`
- API docs: `http://127.0.0.1:8000/docs`

Default local development mode is:

- Docker for `db` and `api`
- host machine for `web`

The compose `web` service is now opt-in behind the `web` profile so it does not conflict with local `next dev`.

If you explicitly want frontend-in-Docker:

```bash
docker compose -f infra/docker-compose.yml --profile web up -d web
```

Do not run that at the same time as host `cd apps/web && npm run dev`.

### Stop The Stack

```bash
make down
```

If you also want to remove database and uploaded-audio volumes:

```bash
make reset-all
```

## Manual Test Flow

This section is the practical "click through the whole app" script.

There are two good ways to test:

- realistic mode: real Google Form URLs configured in env vars
- local operator mode: create reports with `curl` against the hidden ingest endpoint

### Before You Start

1. make sure Docker Desktop or OrbStack is actually running
2. run `make up`
3. run `make migrate` if needed
4. run `make web`
5. use `http://127.0.0.1:3000`, not `localhost` if your browser cached a broken session or asset path

Quick health checks:

```bash
curl -I http://127.0.0.1:3000/
curl -s http://127.0.0.1:8000/health
make ps
```

### Track A: Public User Flow With Real Google Forms

Use this if your `.env` or compose environment already points to real forms.

#### A1. Homepage

1. open `http://127.0.0.1:3000/`
2. confirm you see:
   - emergency notice
   - three action cards
   - button to open the public board
   - button to open staff login
3. click each public action
4. verify each opens the intended Google Form in a new tab

Expected result:

- the app is acting as a public entry hub, not a direct intake form

#### A2. Submit A Test Form

1. submit one safe report
2. submit one missing-person report
3. submit one update / lead report
4. wait for the Google Sheet trigger / Apps Script to POST into Reach

Expected result:

- the submissions should appear later in the staff queue after import

### Track B: Local Intake Simulation Without Google Forms

Use this when you want to test the full Reach workflow locally without depending on Google.

Set an ingest token if you have not already:

```bash
export Reach_GOOGLE_FORM_INGEST_TOKEN=local-ingest-token
docker compose -f infra/docker-compose.yml up -d
```

Then create three records manually:

```bash
curl -s -X POST http://127.0.0.1:8000/ingest/google-form \
  -H "content-type: application/json" \
  -H "x-Reach-ingest-token: local-ingest-token" \
  --data '{
    "report_kind":"safe",
    "location_summary":"Shelter registration desk",
    "details_summary":"Resident B checked in safely with volunteers.",
    "subject_name":"Resident B",
    "source_relationship":"self",
    "public_update_hint":"Resident B confirmed safe at shelter registration.",
    "source_form_name":"Safe Check-In Form",
    "source_entry_id":"safe-001"
  }'

curl -s -X POST http://127.0.0.1:8000/ingest/google-form \
  -H "content-type: application/json" \
  -H "x-Reach-ingest-token: local-ingest-token" \
  --data '{
    "report_kind":"missing",
    "location_summary":"Tower 2 lobby",
    "details_summary":"Family cannot reach Resident A and asks for verification.",
    "subject_name":"Resident A",
    "source_relationship":"family_friend",
    "public_update_hint":"Missing-person report received. Waiting for volunteer verification.",
    "source_form_name":"Missing Person Form",
    "source_entry_id":"missing-001"
  }'

curl -s -X POST http://127.0.0.1:8000/ingest/google-form \
  -H "content-type: application/json" \
  -H "x-Reach-ingest-token: local-ingest-token" \
  --data '{
    "report_kind":"update",
    "location_summary":"Shelter desk",
    "details_summary":"Volunteer received a possible sighting update for Resident A.",
    "subject_name":"Resident A",
    "source_relationship":"community_member",
    "update_category":"missing_lead",
    "public_update_hint":"Possible lead received and queued for volunteer follow-up.",
    "source_form_name":"Update Lead Form",
    "source_entry_id":"update-001"
  }'
```

Expected result:

- you now have one safe report and an update chain of two reports for `Resident A`

### Track C: Staff Login And Queue

1. open `http://127.0.0.1:3000/staff/login`
2. enter any email such as `volunteer@example.com`
3. submit
4. continue through the development magic-link verifier
5. land on `/staff`

Expected result:

- queue loads successfully
- you see summary cards
- you see event/group cards
- the `Resident A` reports should be grouped together because `subject_name` matches

What to inspect on the queue page:

- source mode badge
- event title
- publish state
- number of related cases
- latest update
- open/unassigned counts

### Track D: Staff Detail Verification

1. open one grouped record from the queue
2. verify the detail page loads:
   - review summary
   - internal note form
   - publish workflow form
   - claim card
   - event association block
   - audit log
3. save an internal note
4. click claim
5. publish a public update by selecting a status and entering a short summary

Suggested test publish values:

- status: `waiting_for_information`
- public update: `Volunteers are following up on a possible sighting and waiting for confirmation.`

Expected result:

- success banner appears
- record reloads
- latest public update changes
- audit log shows the action

### Track E: Related Record / Duplicate Marker

Use this to test the new relation marker workflow.

1. open the `Resident A` case detail
2. in the event association panel, enter the other related case ID
3. choose a relation type:
   - `Related update`
   - `Possible duplicate`
   - `Confirmed duplicate`
4. optionally enter an internal note
5. submit

Expected result:

- success banner appears
- the "marked related records" list updates
- audit log contains a `relation_marked` metadata entry

### Track F: Public Board Verification

1. open `http://127.0.0.1:3000/board`
2. verify summary counts render
3. find the record you just published
4. verify the card shows:
   - mapped public status
   - latest public update
   - location summary
   - timestamps

Expected result:

- staff-published updates are visible on the public board
- the board is derived from internal cases, not manually duplicated data

### Track G: API-Level Spot Checks

If a page looks wrong, verify backend state directly.

Get a magic link:

```bash
curl -s -X POST http://127.0.0.1:8000/auth/request-magic-link \
  -H "content-type: application/json" \
  --data '{"email":"volunteer@example.com"}'
```

Check the public board:

```bash
curl -s http://127.0.0.1:8000/board | jq
```

Check running services:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs web --tail=100
docker compose -f infra/docker-compose.yml logs api --tail=100
```

## Common Local Problems

### Port 3000 Already In Use

Cause:

- Docker `web` service is already bound to `3000`

Fix:

- use the Docker web service and do not start host `npm run dev`
- or stop compose first and then run host Next.js on a different port

### Browser Shows HTML But JS Assets Fail To Load

Cause:

- stale Next dev state
- broken browser cache
- wrong server process on port `3000`

Fix:

1. check `docker compose -f infra/docker-compose.yml ps`
2. reload with hard refresh
3. restart only the web container:

```bash
docker compose -f infra/docker-compose.yml restart web
```

### Docker Daemon Not Running

Cause:

- OrbStack or Docker Desktop is open but the engine is not actually started

Fix:

- start the engine first, then rerun `docker compose ...`

### Queue Is Empty

Cause:

- no imported reports yet
- Google Form bridge token missing

Fix:

- submit a real form
- or use the local ingest `curl` examples above

## Current Important Limitation

This project does not yet have a normalized `event` model.

Today:

- queue grouping is synthetic
- board records are derived from cases
- related-record links are stored as audit metadata, not a dedicated relational table

That is acceptable for the current phase because the workflow is more important than schema perfection.

If the product later grows into a larger multi-incident system, the next structural step would be:

1. introduce a real `records` or `events` model
2. move duplicate/update links into first-class tables
3. separate internal raw reports from public published entries

## Verification Commands

Backend:

```bash
PYTHONPATH="$(pwd)/apps/api" python3 -m pytest
PYTHONPYCACHEPREFIX=/tmp/Reach-pycache python3 -m compileall apps/api/app apps/api/tests
```

Frontend:

```bash
cd apps/web
npm run lint
npm run typecheck
npm run build
```
