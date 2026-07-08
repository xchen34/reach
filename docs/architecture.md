# Beacon Architecture

Phase 1.5 extends the Phase 1 foundation with a minimal voice-intake domain that supports anonymous audio upload, human-confirmed transcript editing, and staff-only retrieval of retained voice metadata.

## Structure

- `apps/web`: Next.js app with locale-aware shell pages and accessible baseline UI.
- `apps/api`: FastAPI app with health, development magic-link auth, staff session verification, Phase 1 case-domain endpoints, and Phase 1.5 voice-intake endpoints.
- `infra`: local Docker Compose, Dockerfiles, env template, and a future Caddy example.
- `docs`: project documentation and phase notes.

## Backend contract

FastAPI OpenAPI is the source of truth for backend contracts in this phase. `docs/openapi.yaml` is the checked-in contract snapshot. The frontend keeps its TypeScript API types lightweight and local.

## Auth foundation

The current auth implementation provides:

- `User` and `MagicLinkToken` models
- one-time token generation
- short token expiry
- development-only delivery through API response or logs
- token verification and staff session creation
- bearer-token based staff API authentication

This phase still does not implement frontend staff session UX or protected web routes.

## Voice intake foundation

The Phase 1.5 voice flow is intentionally bounded:

- anonymous users upload short audio clips through a multipart API;
- the API stores audio on local filesystem storage, never in the database;
- speech-to-text is routed through a provider abstraction;
- the checked-in implementation uses a development stub provider rather than a production cloud dependency;
- users must confirm or edit the transcript before it can be attached to a case;
- staff can retrieve voice metadata and authorized audio only through authenticated staff routes.

No audio is exposed through public guessable URLs, and the voice layer does not infer safety, urgency, or recommended emergency action from audio.

## Database

PostgreSQL is the only database. Alembic manages migrations. The schema now includes:

- staff auth tables: `users`, `magic_link_tokens`, `staff_sessions`
- case tables: `cases`, `case_share_links`, `case_actions`
- audit table: `audit_log_entries`
- voice table: `voice_intakes`
