# Testing Strategy

The current test suite focuses on making the mock-first P0 flow stable without requiring real X API access.

## Validation Gate

Run before checkpoint commits:

```bash
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```

`pnpm db:validate` requires `DATABASE_URL` to be set. The example local value is:

```bash
postgresql://postgres:postgres@localhost:5432/xcleaner?schema=public
```

## Unit and API Tests

`pnpm test` runs Turbo across packages.

Current meaningful coverage:

- AES-256-GCM encryption roundtrip and AAD failure.
- Cycle-safe secret redaction.
- API health.
- API mock scan persistence.
- API deletion job creation and enqueue call.
- Worker dry-run behavior.
- Worker `404` as already deleted.
- Worker `429` as waiting rate limit and delayed retry.

Some package test scripts still return scaffold placeholders because those packages do not yet have dedicated tests.

## E2E Smoke

Run:

```bash
pnpm test:e2e
```

The Playwright smoke test exercises dashboard -> scan -> preview -> confirm -> job progress and validates export links.

E2E requires:

- Postgres on `localhost:5432`.
- Redis on `localhost:6379`.
- A valid `TOKEN_ENC_KEY` in the Playwright web server environment.

Do not mark E2E as passing if Docker, Postgres, or Redis are unavailable.

## Lint

Lint is not configured yet. `pnpm lint` exits with a message instead of running an incomplete or interactive lint setup. Use typecheck, tests, and build as the current quality gate.

## Future Coverage

- Archive import parsing.
- Manual import validation.
- Real X client contract tests with mocked HTTP.
- OAuth failure/session cleanup paths.
- Export authorization and CSV edge cases.
- Browser tests for filtering and non-dry-run mock behavior.
