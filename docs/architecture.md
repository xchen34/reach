# Beacon Architecture

Phase 1 extends the Phase 0 foundation with the first case-domain API and database contract.

## Structure

- `apps/web`: Next.js app with locale-aware shell pages and accessible baseline UI.
- `apps/api`: FastAPI app with health, development magic-link auth, staff session verification, and Phase 1 case-domain contract stubs.
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

## Database

PostgreSQL is the only database. Alembic manages migrations. The schema now includes:

- staff auth tables: `users`, `magic_link_tokens`, `staff_sessions`
- case tables: `cases`, `case_share_links`, `case_actions`
- audit table: `audit_log_entries`
