# Security Notes

This project is a production-quality MVP scaffold, not a complete production system. The current security posture is designed around privacy-first local development and clear extension points for later hardening.

## Non-Goals

- No password collection.
- No scraping.
- No browser automation against X.
- No real X API production behavior in the current checkpoint.

## OAuth and PKCE

- OAuth authorization is handled by the API.
- PKCE `code_verifier` is stored encrypted in `XAuthSession.encCodeVerifier`.
- Auth sessions are short-lived, currently about 10 minutes.
- Successful callback invalidates the auth session.
- Real token exchange remains intentionally skeletal.

Never log:

- `code_verifier`
- OAuth `code`
- access tokens
- refresh tokens
- client secrets
- Authorization headers

## Token Encryption

Access and refresh tokens are encrypted at rest with AES-256-GCM.

`TOKEN_ENC_KEY` must be a 32-byte base64 key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Stored encrypted payloads include:

- `iv`
- `authTag`
- `ciphertext`

## Logging and Redaction

API and worker loggers use redaction helpers for sensitive fields. The redaction utility handles nested/circular objects so logging does not crash service startup.

Sensitive fields should be removed or masked before entering logs, audit metadata, errors, or exports.

## Deletion Safety

- Dry-run is the default.
- Real deletion requires explicit user confirmation in the UI.
- Worker processing is idempotent and skips finalized items.
- `404` from delete is treated as already deleted.
- `429` from delete records rate-limit wait state and retries later.

## Audit Logs and Exports

Audit logs are recorded for OAuth, scans, deletion job creation, item status changes, failures, and exports. CSV/JSON exports include sensitive user data and should be treated as private.

## Current Known Gaps

- Local scaffold auth uses `x-user-id` / `userId` for mock development and is not production authentication.
- Real X API token refresh, revocation, and account disconnect are not implemented.
- Production deployment hardening, session management, and secret-manager integration are future work.
