# Local Development

## Prerequisites

- Docker
- Docker Compose

## Startup

Run:

```bash
docker compose -f infra/docker-compose.yml up --build
```

In another shell, apply migrations:

```bash
docker compose -f infra/docker-compose.yml exec api alembic upgrade head
```

## Services

- Web: `http://localhost:3000`
- API: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

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
