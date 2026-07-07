# Emergency Companion

## Stack
- Next.js + TypeScript frontend
- FastAPI + Python backend
- PostgreSQL
- Docker Compose
- Later: PWA, RAG, LLM tool calling

## Product rules
- Accessibility-first, mobile-first, offline-aware.
- Large touch targets, high contrast, keyboard and screen-reader support.
- Keep UI simple and action-oriented.
- Never claim to contact emergency services.
- Never let AI decide that a situation is safe or that the user should delay emergency services.
- Use curated official guidance only for safety advice.
- Keep personal data minimal and deletable.

## Engineering rules
- Work one phase at a time.
- Before coding, explain the plan and list files to change.
- Run lint, tests, typecheck, and build after changes.
- Never commit secrets; use .env.example.
- Prefer simple explicit code over abstractions.
- Update README after each phase.
