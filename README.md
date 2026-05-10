# X Account Cleaner

Privacy-first, OAuth-based X/Twitter post cleaner with dry-run preview, queue-based deletion jobs, rate-limit-aware worker behavior, and audit logging.

## Project Status

This is a production-quality MVP scaffold and public portfolio checkpoint. Local development is mock-first: the full scan, preview, dry-run deletion job, progress, and export flow works without real X API credentials.

Real X API integration is intentionally skeleton-level for now. The code keeps the API boundary in place through `XApiClient`, but production X behavior, deployment hardening, billing, user sessions, and account revocation flows are future work.

## Why This Exists

People should be able to clean their own X/Twitter posts, replies, and reposts safely. The product direction is OAuth-only account access, preview before action, dry-run by default, explicit confirmation for irreversible deletion, background jobs for rate limits, and audit trails for sensitive operations.

No passwords. No scraping. No browser automation against X.

## Architecture

- `apps/web`: Next.js UI for dashboard, scan, preview, confirmation, job progress, and exports.
- `apps/api`: Fastify TypeScript API for OAuth/PKCE scaffold, post scanning, job creation, progress, and exports.
- `apps/worker`: BullMQ worker that processes deletion jobs idempotently.
- `prisma`: PostgreSQL schema and seed data.
- `infra`: Docker Compose for local Postgres and Redis.
- `packages/shared`: shared DTOs, enums, and Zod schemas.
- `packages/crypto`: AES-256-GCM encryption helpers and secret redaction.
- `packages/x-client`: `XApiClient` abstraction with mock client and real-client skeleton.

The API persists posts and jobs through Prisma/Postgres, enqueues deletion work through BullMQ/Redis, and exposes CSV/JSON exports. The worker updates item and parent job status as it processes work. Audit logs record OAuth, scan, job, item, and export events.

```mermaid
flowchart LR
  Web["Next.js Web"] -->|"scan / preview / confirm"| API["Fastify API"]
  Web -->|"progress / exports"| API
  API -->|"Prisma reads/writes"| DB[("Postgres")]
  API -->|"enqueue deletion job"| Redis[("BullMQ / Redis")]
  Redis --> Worker["BullMQ Worker"]
  Worker -->|"deleteTweet / deleteRetweet"| XClient["XApiClient"]
  XClient --> Mock["Mock X client by default"]
  XClient -.-> Real["Real X client skeleton"]
  Worker -->|"item + job status updates"| DB
  API -->|"audit logs"| DB
```

## Features

- Mock-first local flow.
- OAuth 2.0 + PKCE scaffold.
- Encrypted token and PKCE verifier storage with AES-256-GCM.
- Mock post scanning for posts, replies, quotes, and reposts.
- Preview page with basic type, keyword, and date filters.
- Dry-run deletion is the default.
- Irreversible-action confirmation screen.
- Queue-based deletion jobs through BullMQ.
- Idempotent worker behavior.
- `404` delete responses handled as already deleted.
- `429` delete responses handled as waiting for rate-limit reset.
- CSV and JSON export endpoints.
- Unit, API, worker, and Playwright smoke test coverage.

## Local Development

Install dependencies:

```bash
pnpm install
```

Copy env examples:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Generate `TOKEN_ENC_KEY` and paste it into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Start Postgres and Redis:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Prepare Prisma:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:push
pnpm db:seed
```

Run all local services:

```bash
pnpm dev
```

Separate service commands are also available:

```bash
pnpm build
pnpm -C apps/api dev
pnpm -C apps/worker dev
pnpm -C apps/web dev
```

The API and worker dev scripts run built `dist` files, so rerun `pnpm build` after TypeScript source changes.

## Mock-First Demo Flow

1. Open `http://localhost:3000/dashboard`.
2. Keep the default mock user: `mock-user-1`.
3. Click `Scan Posts`.
4. Preview persisted mock posts.
5. Filter by type, keyword, or before date if desired.
6. Continue to confirmation.
7. Keep dry-run enabled.
8. Create the deletion job.
9. Watch `/jobs/[id]` poll progress every 2 seconds.
10. Export CSV or JSON from the job page.

## Environment Variables

| Variable | Mock mode? | Real X mode? | Example | Description |
| --- | --- | --- | --- | --- |
| `WEB_BASE_URL` | Yes | Yes | `http://localhost:3000` | Web app URL used for redirects and CORS. |
| `API_BASE_URL` | Yes | Yes | `http://localhost:4000` | API URL used by OAuth callback simulation. |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Yes | `http://localhost:4000` | Browser-visible API base URL for the web app. |
| `DATABASE_URL` | Yes | Yes | `postgresql://postgres:postgres@localhost:5432/xcleaner?schema=public` | Prisma Postgres connection string. |
| `REDIS_URL` | Yes | Yes | `redis://localhost:6379` | BullMQ Redis connection string. |
| `TOKEN_ENC_KEY` | Yes | Yes | generated 32-byte base64 | AES-256-GCM key for token/verifier encryption. |
| `X_USE_REAL` | No | Yes | `false` | Enables the real X client path only when set to `true`. |
| `X_CLIENT_ID` | No | Yes | empty in mock mode | X OAuth client ID. |
| `X_CLIENT_SECRET` | No | Yes | empty in mock mode | X OAuth client secret; never commit it. |
| `X_REDIRECT_URI` | No | Yes | `http://localhost:4000/auth/x/callback` | OAuth redirect URI. |

## API Overview

| Method | Path | Purpose | Mock-first behavior |
| --- | --- | --- | --- |
| `GET` | `/health` | Health check | Returns `{ ok: true }`. |
| `GET` | `/auth/x/start` | Start OAuth/PKCE | Without X credentials, redirects to mock callback. |
| `GET` | `/auth/x/callback` | Complete OAuth/PKCE | Stores encrypted mock tokens and redirects to dashboard. |
| `POST` | `/v1/scan` | Scan posts | Resolves `mock-user-1`, calls mock X client, persists mock posts. |
| `GET` | `/v1/posts` | List preview posts | Reads persisted posts with optional filters. |
| `POST` | `/v1/deletions` | Create deletion job | Creates DB job/items and enqueues BullMQ work. |
| `GET` | `/v1/deletions/:id` | Job progress | Returns job, counts, and item summary. |
| `GET` | `/v1/deletions/:id/export.json` | Export JSON | Returns job/items/posts JSON. |
| `GET` | `/v1/deletions/:id/export.csv` | Export CSV | Returns job/items/posts CSV. |

Local scaffold auth uses `x-user-id: mock-user-1` or `?userId=mock-user-1`. This is not production authentication.

## Testing

Run the stable validation gate:

```bash
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```

Run Playwright smoke tests when local Postgres and Redis are running:

```bash
pnpm test:e2e
```

E2E starts the API and web app, and the smoke test starts the worker. It still depends on local infrastructure being reachable on ports `5432` and `6379`.

Lint is not configured yet. `pnpm lint` exits cleanly with a message; use typecheck, tests, and build as the current quality gate.

## Security Notes

- OAuth only; no password collection.
- No scraping or browser automation against X.
- Access tokens, refresh tokens, and PKCE verifiers are encrypted at rest.
- `TOKEN_ENC_KEY` must be a 32-byte base64 key.
- Logs redact OAuth codes, verifiers, tokens, client secrets, and Authorization headers.
- Dry-run is the default.
- Real deletion requires explicit confirmation.
- Worker processing is idempotent.
- Exports and audit logs are sensitive user data.

See [`docs/security.md`](docs/security.md) for more detail.

## Troubleshooting

### Docker Desktop Pipe Missing

Start Docker Desktop and wait for the Linux engine to finish booting, then rerun:

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Ports 5432 or 6379 Closed

Check local connectivity:

```powershell
Test-NetConnection localhost -Port 5432
Test-NetConnection localhost -Port 6379
```

If either fails, start the local infrastructure.

### Redis Not Running

BullMQ enqueueing and worker processing require Redis. Start infra and confirm Redis is healthy:

```bash
docker compose -f infra/docker-compose.yml ps redis
```

### Postgres Not Running

Prisma and API persistence require Postgres:

```bash
docker compose -f infra/docker-compose.yml ps postgres
```

### Prisma DB Push Fails

Confirm `.env` exists, `DATABASE_URL` is set, and Postgres is reachable. Then rerun:

```bash
pnpm db:push
```

### Playwright Cannot Start API

Playwright runs Prisma/API startup steps. If Postgres or Redis are unavailable, the API cannot complete the smoke flow.

### TOKEN_ENC_KEY Invalid

`TOKEN_ENC_KEY` must decode to exactly 32 bytes. Regenerate it with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Roadmap

- Full X archive import.
- Real X API integration.
- Account disconnect and OAuth revoke flow.
- Advanced filters.
- Preservation rules for high-engagement posts.
- Scheduled cleanup jobs.
- Deployment guide.

