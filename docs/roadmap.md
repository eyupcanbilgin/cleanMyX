# Roadmap

This roadmap keeps the project honest about what exists now versus what should come later. The current checkpoint is a mock-first, portfolio-grade MVP scaffold.

## P0 Complete

- Mock-first scan -> preview -> dry-run job flow.
- BullMQ enqueueing and worker processing.
- Job progress polling.
- CSV/JSON exports.
- AES-256-GCM token encryption helpers.
- Secret redaction.
- API, worker, and smoke test scaffolding.

## P1

- Full X archive import.
- Manual import validation and review UI.
- Account disconnect and OAuth revoke flow.
- Stronger session/auth model for non-local use.
- More robust OAuth failure cleanup.
- Export access controls.
- CSV escaping and export edge-case coverage.

## P2

- Real X API integration behind `XApiClient`.
- Token refresh and scope management.
- Advanced filters for date ranges, post type, keywords, mentions, and media.
- Preservation rules for high-engagement posts.
- Scheduled cleanup jobs.
- Job cancellation and resume controls.

## P3

- Deployment guide.
- Production secret-manager integration.
- Observability dashboard.
- Multi-account support.
- Billing/subscription model, if the product direction needs it.

