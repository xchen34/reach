# Beacon

Beacon is an accessibility-first, offline-aware, AI-assisted crisis reporting and coordination platform. This repository currently implements the Phase 1 backend domain foundation plus a Phase 1.5 voice-intake backend foundation on top of the Phase 0 infrastructure.

## Current scope

- Next.js shell with English, French, and Chinese locale routes
- FastAPI app with a health endpoint
- PostgreSQL connection and Alembic migration setup
- Development-only staff magic-link request and verification flow
- Minimal staff session support for authenticated API endpoints
- Initial case, share-link, case action, and audit-log database domain
- Voice upload, transcript confirmation, and staff-only voice access contract foundation
- OpenAPI contract file at `docs/openapi.yaml`
- Local Docker Compose workflow

## Not included yet

- Frontend case management screens
- AI workflows
- Offline drafts
- WebSockets
- Production speech-to-text integration
- Final voice recording UI

## Local setup

```bash
docker compose -f infra/docker-compose.yml up --build
docker compose -f infra/docker-compose.yml exec api alembic upgrade head
```

Then open:

- Web: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`

## Development auth flow

Use the request endpoint to generate a short-lived magic link:

```bash
curl -X POST http://localhost:8000/auth/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"volunteer@example.com"}'
```

In Phase 0, the login link is visible in the API response or logs for local development. Session handling is intentionally deferred to Phase 1.

## Phase 1 API foundation

- `POST /auth/request-magic-link`
- `POST /auth/verify-magic-link`
- `GET /staff/me`
- `POST /cases`
- `GET /staff/cases`
- `GET /staff/cases/{case_id}`
- `GET /staff/cases/{case_id}/voice`
- `GET /staff/cases/{case_id}/voice/audio`
- `POST /staff/cases/{case_id}/actions`
- `GET /staff/cases/{case_id}/audit`
- `GET /share/{token}`

## Phase 1.5 voice foundation

- `POST /voice-intakes`
- `POST /voice-intakes/retrieve`
- `POST /voice-intakes/confirm`

The current voice transcription path uses a development stub behind a provider abstraction. Audio is stored in a local Docker volume, not in PostgreSQL or Git.
