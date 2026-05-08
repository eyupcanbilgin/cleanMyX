# X Account Cleaner (MVP Scaffold)

Production-quality SaaS MVP scaffold to connect an X/Twitter account via OAuth, scan posts, preview deletions, and run a safe rate-limit-aware deletion job.

## Monorepo packages
- `apps/web`: Next.js web app
- `apps/api`: Node.js TypeScript API (OAuth + scan + export)
- `apps/worker`: BullMQ worker (deletion jobs)
- `packages/shared`: shared types and utilities
- `packages/crypto`: AES-256-GCM encryption helpers (token/code_verifier encryption)
- `packages/x-client`: X API client interface + mock-first implementation

## Local development
Infrastructure runs via docker-compose (Postgres + Redis). App specifics will be documented as scaffolding lands.

