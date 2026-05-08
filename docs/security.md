# Security notes (scaffold)

## What this product does not do
- No password collection (OAuth only).
- No unsafe browser scraping or automation. Only official API-style abstractions.

## OAuth & PKCE
- OAuth authorization is handled by the backend API.
- PKCE `code_verifier` **must be available during callback** for token exchange.
  - Stored in `XAuthSession.encCodeVerifier` **encrypted** and short-lived (~10 minutes).
  - After successful callback, the session is deleted/invalidated.
- Never log: `code_verifier`, `code`, `access_token`, `refresh_token`, `client_secret`.

## Token storage encryption
- Access/refresh tokens are stored **encrypted at rest** using **AES-256-GCM**.
- `TOKEN_ENC_KEY` must be a **32-byte base64** key.
- Stored encrypted payload includes: `iv`, `authTag`, `ciphertext` (base64).
- In production, store secrets in a secret manager (not in git, not in plaintext `.env`).

## Minimum scopes
Prefer minimum required scopes. For deletion MVP you typically need:
- read: tweets/posts
- delete/write: tweet delete endpoints
- user identity: users.read
Only request offline/refresh scopes if you actually need long-running jobs across sessions.

## Logging & redaction
- JSON logs should redact headers and sensitive body fields (Authorization, tokens, OAuth codes).
- When in doubt, treat all OAuth and token-related fields as secrets and redact.

## Audit trail
Record audit logs for:
- OAuth start/callback success/failure
- Scan started/finished
- Deletion job created
- Item deletion success/failure (including rate-limit waits)
- Export generation (CSV/JSON)

## Deletion safety defaults
- Default mode should be **dry-run**.
- Real deletion requires explicit confirmation with an irreversible-action warning.
- Workers must be idempotent and must not re-delete items already finalized.

