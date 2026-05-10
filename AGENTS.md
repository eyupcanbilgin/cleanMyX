# AGENTS.md

## Project Summary

X Account Cleaner is a privacy-first MVP scaffold for letting a user connect their own X/Twitter account, scan posts/replies/reposts, preview deletion candidates, and run dry-run or confirmed deletion jobs through a rate-limit-aware worker.

## Architecture Summary

- `apps/web`: Next.js UI for connect, dashboard, preview, confirmation, and job status.
- `apps/api`: Fastify TypeScript API for OAuth/PKCE, scans, deletion job creation, job status, and exports.
- `apps/worker`: BullMQ worker for deletion jobs.
- `packages/shared`: shared enums, DTO types, and validation schemas.
- `packages/crypto`: AES-256-GCM encryption helpers and secret redaction utilities.
- `packages/x-client`: `XApiClient` interface, mock client, and real-client skeleton.
- `prisma`: Prisma schema and seed data.
- `infra`: local Postgres and Redis Docker Compose.
- `docs`: security and operating notes.

## Development Rules

- Keep changes small and scoped; do not refactor broad areas unless explicitly asked.
- Complete the mock-first P0 flow before expanding real X API behavior.
- Do not remove existing code or generated scaffold decisions without approval.
- Prefer shared schemas/types from `packages/shared` for API boundaries.
- Keep real X API integration as a skeleton unless the user explicitly asks to implement it.
- Do not touch secrets or commit local `.env` files.

## Security Rules

- Never log access tokens, refresh tokens, auth codes, `code_verifier`, client secrets, or Authorization headers.
- `TOKEN_ENC_KEY` must be a 32-byte base64 key.
- Access tokens, refresh tokens, and PKCE `code_verifier` values must be encrypted with AES-256-GCM at rest.
- OAuth auth sessions must be short-lived and invalidated after callback.
- Treat exports and audit logs as sensitive user data.

## Product Safety Rules

- Mock-first local development is the default.
- Dry-run deletion must be the default behavior.
- Real deletion requires explicit user confirmation.
- Worker processing must be idempotent; finalized items must not be processed again.
- A 404 during deletion should be treated as already deleted.
- A 429 during deletion should respect the rate-limit reset and retry later.
- Do not add scraping, browser automation against X, password collection, or unofficial account access.
- Deletion logic must support post sources: `API_SCAN`, `ARCHIVE_IMPORT`, and `MANUAL_IMPORT`.

## Expected Local Commands

- Install: `pnpm install`
- Start infrastructure: `docker compose -f infra/docker-compose.yml up -d`
- Generate Prisma client: `pnpm db:generate`
- Validate Prisma schema: `pnpm db:validate`
- Push schema locally: `pnpm db:push`
- Seed local data: `pnpm db:seed`
- Run all local services: `pnpm dev`
- Build API/worker/web: `pnpm build`
- Run API after build: `pnpm -C apps/api dev`
- Run worker after build: `pnpm -C apps/worker dev`
- Run web: `pnpm -C apps/web dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Unit/API tests: `pnpm test`
- E2E smoke tests: `pnpm test:e2e`
- Lint: not configured yet; use typecheck/tests/build as the current quality gate.

## Current Priority

Maintain the mock-first P0 end-to-end flow before implementing real X API behavior:

1. OAuth mock connect creates/loads a usable local user and encrypted token.
2. Dashboard scan persists mock posts.
3. Preview lists filterable deletion candidates.
4. Confirmation creates dry-run jobs by default.
5. Jobs are enqueued and processed by the worker.
6. Job status, item counts, and exports reflect worker results.

## Definition of Done

- `pnpm build`, `pnpm typecheck`, and relevant tests pass.
- Prisma changes validate and include a migration plan when needed.
- New endpoints validate inputs and redact sensitive data in logs.
- Dry-run remains default and real deletion remains explicitly confirmed.
- Worker changes are idempotent and handle 404/429 behavior.
- Documentation or this file is updated when workflows or guardrails change.
