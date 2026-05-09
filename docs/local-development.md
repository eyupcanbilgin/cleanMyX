# Local Development

This project is mock-first by default. The local P0 flow uses the mock X client, a local Postgres database, and a local Redis queue. It does not require real X API credentials.

## Setup

Install dependencies:

```bash
pnpm install
```

Copy local environment examples:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Generate a 32-byte base64 token encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste that value into `.env` as `TOKEN_ENC_KEY`. Leave `X_USE_REAL=false` for mock-first local development. Do not add real X credentials unless real X integration is explicitly being worked on.

Start local infrastructure:

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

Build API and worker output:

```bash
pnpm build
```

Run the services in separate terminals:

```bash
pnpm -C apps/api dev
```

```bash
pnpm -C apps/worker dev
```

```bash
pnpm -C apps/web dev
```

API runs on `http://localhost:4000`, web runs on `http://localhost:3000`, Postgres runs on `localhost:5432`, and Redis runs on `localhost:6379`.

## Mock-First P0 Flow

1. Open `http://localhost:3000/dashboard`.
2. Keep the default mock user, `mock-user-1`.
3. Click `Scan Posts`.
4. The API resolves/creates the mock user, creates an encrypted mock token if needed, fetches mock posts from the mock X client, and persists them.
5. The app redirects to preview.
6. Use preview filters for type, keyword, or before date.
7. Continue to confirm.
8. Keep dry-run enabled unless intentionally testing mock non-dry-run behavior.
9. Create the deletion job.
10. The API creates `DeletionJob` and `DeletionJobItem` rows, then enqueues the BullMQ job.
11. The app redirects to `/jobs/[id]`.
12. The worker consumes the queue and updates item/job statuses.
13. The job page polls every 2 seconds.
14. Use `Export JSON` or `Export CSV` from the job page.

Dry-run remains the default. In dry-run jobs, the worker marks items as skipped and does not call delete methods.

## Validation

Use these before creating a checkpoint commit:

```bash
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```

Playwright smoke tests require local Postgres and Redis:

```bash
pnpm test:e2e
```

Lint is not configured yet. For now, use `pnpm typecheck`, `pnpm test`, and `pnpm build` as the stable quality gate.

## Troubleshooting

### Docker Desktop Pipe Missing

If `docker ps` reports a missing Docker Desktop pipe, Docker Desktop is not running or its Linux engine is unavailable. Start Docker Desktop, wait for it to finish booting, then rerun:

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Ports 5432 or 6379 Closed

If Postgres or Redis ports are closed, the API, worker, Prisma, and E2E tests cannot complete. Check:

```powershell
Test-NetConnection localhost -Port 5432
Test-NetConnection localhost -Port 6379
```

Start infra if either check fails:

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Redis Not Running

BullMQ enqueueing and worker processing require Redis. If job creation returns `queue_unavailable` or the worker cannot start, check Redis:

```bash
docker compose -f infra/docker-compose.yml ps redis
```

### Postgres Not Running

Prisma commands and API persistence require Postgres. If `pnpm db:push` or API scan fails, check Postgres:

```bash
docker compose -f infra/docker-compose.yml ps postgres
```

### Prisma DB Push Failure

`pnpm db:push` requires `DATABASE_URL` and a reachable Postgres instance. Confirm `.env` exists, `DATABASE_URL` points to local Postgres, and Docker Compose is running.

### Playwright E2E Requires Local Infra

`pnpm test:e2e` starts the API and web app, and the smoke test starts the worker. It still requires Postgres and Redis to be available locally before the test starts.
