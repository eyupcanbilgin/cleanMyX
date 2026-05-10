# Local Development

X Account Cleaner is mock-first by default. The local flow uses the mock X client, Postgres, Redis, and the same API/worker contracts intended for the future real X integration.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop with Linux engine running

## Setup

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Generate `TOKEN_ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Paste the generated value into `.env`. Keep `X_USE_REAL=false`.

Start infrastructure:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Prepare the database:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:push
pnpm db:seed
```

Run all services:

```bash
pnpm dev
```

`pnpm dev` builds the workspace first, then starts the web, API, and worker dev scripts through Turbo.

Separate service commands:

```bash
pnpm build
pnpm -C apps/api dev
pnpm -C apps/worker dev
pnpm -C apps/web dev
```

The API and worker dev scripts watch built `dist` files. Rerun `pnpm build` after TypeScript source changes.

## Mock Demo Flow

1. Open `http://localhost:3000/dashboard`.
2. Keep `mock-user-1`.
3. Click `Scan Posts`.
4. Preview persisted mock posts.
5. Continue to confirmation.
6. Keep dry-run enabled.
7. Create a deletion job.
8. Watch `/jobs/[id]` update every 2 seconds.
9. Export CSV or JSON.

## Troubleshooting

### Docker Desktop Pipe Missing

If Docker reports a missing pipe such as `dockerDesktopLinuxEngine`, start Docker Desktop and wait for the engine to finish booting.

### Ports 5432 or 6379 Closed

Check:

```powershell
Test-NetConnection localhost -Port 5432
Test-NetConnection localhost -Port 6379
```

If either port is closed, run:

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Redis Not Running

Redis is required for BullMQ enqueueing and worker processing:

```bash
docker compose -f infra/docker-compose.yml ps redis
```

### Postgres Not Running

Postgres is required for Prisma, scans, jobs, audit logs, and exports:

```bash
docker compose -f infra/docker-compose.yml ps postgres
```

### Prisma DB Push Failure

Check that `.env` exists, `DATABASE_URL` is set, and Postgres is reachable. Then rerun:

```bash
pnpm db:push
```

### Playwright E2E Requires Local Infra

`pnpm test:e2e` requires Postgres and Redis on `localhost:5432` and `localhost:6379`.

### TOKEN_ENC_KEY Invalid

`TOKEN_ENC_KEY` must decode to exactly 32 bytes. Regenerate it with the command above if startup fails with a key-length error.
