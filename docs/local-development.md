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

## Configure Google Forms

Beacon needs three published Google Form responder links: safe check-in, missing or unreachable, and update or lead. Create the forms using [the column mapping](google-form-column-mapping.md), then copy each public responder URL. It must end in `/viewform`, not `/edit`.

Create a local `.env` at the repository root from the example and replace the three placeholders:

```bash
cp infra/.env.example .env
```

```dotenv
NEXT_PUBLIC_SAFE_REPORT_FORM_URL=https://docs.google.com/forms/d/e/SAFE_FORM_ID/viewform
NEXT_PUBLIC_MISSING_REPORT_FORM_URL=https://docs.google.com/forms/d/e/MISSING_FORM_ID/viewform
NEXT_PUBLIC_UPDATE_REPORT_FORM_URL=https://docs.google.com/forms/d/e/UPDATE_FORM_ID/viewform
```

Set a long, unique `BEACON_GOOGLE_FORM_INGEST_TOKEN` in the same `.env`, then copy it only into the Apps Script deployment. Configure the script with the Beacon host and token as described in [the Apps Script example](google-form-apps-script-example.js). Restart `make up` and `make web` after changing `.env`.

Before publishing links to volunteers, open all three from an incognito browser and submit a harmless test response. Confirm that it appears in the staff queue, then publish a deliberately redacted update and confirm that only that update appears on the public board.

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
