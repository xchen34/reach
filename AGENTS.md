# Beacon — Agent Instructions

## Project

Beacon is a minimal case-management MVP for anonymous submissions and staff follow-up.

Current implementation status:

* Phase 0: complete
* Phase 1 domain foundation: complete
* Current work: Phase 1 public frontend, auth hardening, QA/contract validation
* Do not begin Phase 2, AI, RAG, embeddings, LLM tool calling, notifications, or production-scale workflow features unless explicitly requested.

## Stack

* Frontend: Next.js + TypeScript
* Backend: FastAPI + Python
* Database: PostgreSQL + Alembic
* Local development: Docker Compose
* API contract: FastAPI runtime OpenAPI, with `docs/openapi.yaml` maintained as the checked-in contract snapshot

## Product Rules

* Accessibility-first and mobile-first.
* Use large touch targets, high contrast, keyboard navigation, and screen-reader-friendly semantics.
* Keep UI simple, low-complexity, and action-oriented.
* Never claim that the application contacts emergency services.
* Never present the product as a substitute for emergency services.
* Never let AI decide that a situation is safe or that a person should delay contacting emergency services.
* Keep personal data minimal and only collect fields required by the current case workflow.
* Do not add AI-generated safety advice or unverified guidance.
* Private share-link tokens are sensitive: never display them unnecessarily in logs, analytics, or error messages.

## Phase Rules

* Work one phase at a time.
* Do not expand product scope without explicit approval.
* Phase 1 must remain intentionally minimal:

  * anonymous case submission
  * staff magic-link login
  * bearer staff session
  * staff case list and detail access
  * case actions
  * private share-link access
  * audit log visibility
* Prefer completing one end-to-end user flow over adding broad incomplete features.

## API and Data Contract Rules

* Do not invent undocumented API behavior.
* Keep FastAPI routes, Pydantic schemas, and `docs/openapi.yaml` aligned.
* Treat `docs/openapi.yaml` as shared and main-agent-owned unless explicitly assigned.
* Do not modify Alembic migration history, core models, auth dependencies, or security utilities in a child-agent worktree without explicit coordination.
* Ensure there is exactly one Alembic migration head.
* Do not create a migration merely for convenience; first verify whether the current schema supports the requirement.
* Preserve Phase 0 compatibility, especially `POST /auth/request-magic-link`.

## Multi-Agent and Git Worktree Rules

* Each child agent works only inside its assigned git worktree and branch.
* Never edit files outside the current worktree.
* Do not use `git reset --hard`, force-push, amend another agent’s commit, or delete branches/worktrees without explicit approval.
* Before coding, inspect:

  * `git status`
  * current branch
  * relevant existing tests
  * existing API contract and models
* Do not modify files owned by another workstream.
* If a requirement needs a shared file change, stop and report:

  1. the exact file
  2. why the change is necessary
  3. the proposed contract/schema change
  4. likely downstream impact

### Shared Files: Main-Agent-Owned

Do not modify these in child-agent worktrees unless explicitly assigned:

* `docs/openapi.yaml`
* `apps/api/alembic/**`
* `apps/api/app/models/**`
* `apps/api/app/deps.py`
* `apps/api/app/security.py`
* `apps/api/app/db.py`
* `infra/**`
* `.gitignore`
* frontend lockfiles

## Engineering Rules

* Before coding, briefly state:

  * the goal
  * implementation approach
  * files expected to change
  * tests to run
* Prefer simple, explicit code over premature abstractions.
* Avoid new dependencies unless clearly necessary.
* Never commit secrets, credentials, tokens, or real personal data.
* Use `.env.example` for configuration examples.
* Do not silently change unrelated formatting or refactor unrelated files.
* Add or update focused tests for behavior changes.
* Keep error responses explicit and safe; do not leak tokens, internal database details, or stack traces.
* Commit completed work on the current branch using a normal non-amended commit.

## Frontend Rules

* Reuse the existing locale and styling conventions.
* Do not build staff dashboard UI in a public-frontend workstream.
* Do not add API fields that do not exist in the current contract.
* Include loading, validation, empty, error, and success states where relevant.
* Treat share-link URLs as private capability links.
* Keep public-facing forms short and understandable on mobile.

## Playwright and Browser Verification

For frontend work, use Playwright as an iterative verification tool, not only as a final test runner.

* Keep the local development server running while implementing UI.
* After each meaningful frontend change:

  1. reload or revisit the affected route
  2. inspect the rendered UI
  3. check browser console errors
  4. check failed network requests
  5. verify loading, success, and failure states where relevant
* Use screenshots only when useful for diagnosing or documenting a visual issue.
* Do not claim a page works solely because TypeScript, lint, or build passes.

## Required Verification

Run the relevant checks before reporting completion.

### Backend

```bash
PYTHONPATH="$(pwd)/apps/api" python3 -m pytest
PYTHONPYCACHEPREFIX=/tmp/beacon-pycache python3 -m compileall apps/api/app apps/api/tests
```

When migrations or Docker behavior changed:

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml exec -T api alembic upgrade head
docker compose -f infra/docker-compose.yml down
```

### Frontend

```bash
cd apps/web
npm run lint
npm run typecheck
npm run build
```

## Completion Report Format

At completion, report:

1. Summary
2. Files changed
3. User-facing behavior changed
4. API or contract impact
5. Tests and commands run, with results
6. Commit hash
7. Risks, assumptions, or follow-up work

Do not say work is complete if required checks were not run. State clearly what could not be verified.
