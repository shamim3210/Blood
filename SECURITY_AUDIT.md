# BLOODSEARCH v2.5.0 — PRODUCTION SECURITY AUDIT & ARCHITECTURE HARDENING

## 1. Executive Security Summary

BloodSearch v2.5.0 enforces a **Zero-Trust Server-Authoritative Security Architecture** backed exclusively by **Neon Serverless PostgreSQL + Drizzle ORM**, **Google Identity Services (OIDC RS256)**, and **SHA-256 Opaque Session Tokens**.

All legacy Firebase SDKs (`firebase`, `firebase-admin`, `@firebase/*`), Firestore rules/blueprints, and client-trusted identity mechanisms have been completely removed.

---

## 2. Authentication, OIDC & Session Hardening

- **Production Sandbox Lockdown**: The simulated Google account chooser and sandbox-login endpoint now return 404 on production deployments and are disabled by default elsewhere. They require an explicit `BLOODSEARCH_ENABLE_AUTH_SANDBOX=true` opt-in in non-production environments only.

| Control | Implementation | Verification |
|---|---|---|
| **Google OIDC Verification** | Backend RS256 signature verification against Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`) checking `iss`, `aud`, `exp`, `iat`, and `email_verified === true`. | Automated RSA-2048 JWKS test (`tests/productionHardeningAndOidc.test.ts`) |
| **Nonce & Replay Protection** | Single-use cryptographic `nonce` + `state` issued into Neon `oidc_nonces` (10-min TTL) and atomically marked consumed (`consumed_at`) on token exchange. | Replay attempt rejected with `401` |
| **Opaque Session Tokens** | 256-bit CSPRNG session tokens (`bs_sess_<64_hex>`). Only `SHA-256(token)` is persisted in `login_sessions` — raw session tokens are never stored in PostgreSQL. | Verified zero plaintext tokens in `login_sessions` |
| **Cookie & CSRF Hardening** | `HttpOnly` cookie (`SameSite=None; Secure` on HTTPS, `SameSite=Lax` on local HTTP) paired with session-bound `X-CSRF-Token` validation (`timingSafeEqual`) on every cookie-authenticated state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`). | Missing/mismatched `X-CSRF-Token` returns `403` |
| **Capacitor Android Support** | Explicit `Authorization: Bearer bs_sess_...` header support for native Capacitor WebView (`https://localhost` / `capacitor://localhost`). | Verified in integration suite |
| **Password Cryptography** | Salted `scrypt` (`N=16384, r=8, p=1`, 64-byte derived key), NFKC normalization, `crypto.timingSafeEqual`, and dummy-salt verification on unknown emails to block timing enumeration. | Verified `scrypt$` storage & anti-enumeration |
| **Brute-Force & Lockout** | 5 consecutive failed password attempts trigger a 15-minute account lockout (`locked_until` in `auth_identities`). | Verified 5-attempt lockout (`423`/`429`) |
| **Session Rotation & Revocation** | Sessions rotate on login and privilege changes (`CO_ADMIN` claim), immediately revoke on logout (`is_revoked = true`) or password reset, and reject `SUSPENDED` / `BANNED` accounts in real time. | Verified immediate session rejection on `SUSPENDED` & reset |

---

## 3. Neon PostgreSQL & Data Layer Security

- **28 Hardened Tables**: `users`, `auth_identities`, `login_sessions`, `oidc_nonces`, `password_reset_tokens`, `rate_limit_buckets`, `admin_roles`, `donor_profiles`, `private_contacts`, `user_consents`, `contact_requests`, `blood_requests`, `request_responses`, `emergency_alerts`, `live_donor_trips`, `donations`, `hospitals`, `blood_banks`, `blood_inventory`, `notifications`, `device_tokens`, `verification_records`, `community_messages`, `direct_chat_rooms`, `direct_messages`, `announcements`, `reports`, `gratitude_notes`, `audit_logs`.
- **Zero Frontend DB Exposure**: Build-time and runtime browser guard in `src/db/index.ts` throws `FATAL_SECURITY_VIOLATION` if ever imported into client code; ESLint `no-restricted-imports` blocks `src/db/*`, `pg`, `drizzle-orm`, and `@neondatabase/serverless` across frontend components.
- **TLS & Connection Security**: `validateAndNormalizeNeonUrl` enforces `sslmode=verify-full` in production and redacts credentials from all pool error logs.
- **Parameterized SQL Only**: 100% Drizzle ORM parameterized queries + strict server-side input validators (`assertCleanText`, `assertBloodGroup`, `normalizeBangladeshPhone`, `assertOptionalCoordinates`, `validateSafeImageDataUrl`).
- **Least-Privilege Roles**: `drizzle/least_privilege_roles.sql` separates DDL migration access (`bloodsearch_migrator`) from runtime DML access (`bloodsearch_app_runtime`) and revokes `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_logs` from the runtime role after schema migration.
- **Production Schema Fail-Closed**: Production startup verifies the migrated schema but does not execute DDL with runtime credentials or fall back to a local database when Neon is unavailable.
- **RLS Status**: PostgreSQL Row-Level Security is **not enabled**. The API currently performs authorization in server-side repositories and does not set transaction-scoped actor context for RLS policies; enabling RLS without those policies would break access control rather than improve it.

### Live deployment status (2026-11-07)

These are source-level controls, not evidence that production is fully configured.
The checked Neon `production` branch currently has no application tables, the live
`/api/v1/auth/config` endpoint returns HTTP 500, and Vercel has not been configured
with the real Neon and Google OAuth credentials. No RLS policy or schema migration
has been applied to that branch. Do not treat production login/database access as
ready until an authorized owner configures secrets, applies migrations and role
grants, deploys the code, and verifies the live endpoints.

---

## 4. Donor Privacy, Anti-Scraping & Contact Protection

1. **Zero Raw PII in Public Search**: `GET /api/v1/donors/search` queries **only** `donor_profiles` (never joining `private_contacts`), rounds GPS coordinates to 3 decimals (~110m neighborhood precision), and returns masked phone hints (`+88017******78`).
2. **4-Tier Contact Vault (`private_contacts`)**:
   - `PUBLIC_OPT_IN`: Donor explicitly opts in to urgent Call / SMS / WhatsApp / Facebook contact (`GET /api/v1/donors/:uid/opted-in-contact`, rate-limited & audit-logged).
   - `REQUEST_ONLY` / `EMERGENCY_VERIFIED_ONLY`: Requires authenticated `contact_requests` approval (`24h` time-boxed grant) or active SOS response acceptance before unmasking.
   - `DND_PRIVATE`: Blocks all public and seeker unmasking (`403 DONOR_DND_PRIVATE`).
3. **Bulk Export Disabled**: Admin `.CSV` and `.JSON` bulk donor export controls are removed from the Admin Portal to prevent mass data exfiltration if an operator screen is left unattended.

---

## 5. Backend API & Transport Defenses

- **Distributed Rate Limiting**: Backed by Neon PostgreSQL `rate_limit_buckets` (`consumeDistributedRateLimit`) so rate limits hold across horizontally scaled Cloud Run / serverless instances, returning `429 Too Many Requests` + `Retry-After`.
- **Strict CORS & Origin Validation**: Explicit allowlist (`APP_URL`, `CORS_ALLOWED_ORIGINS`, `capacitor://localhost`, `https://localhost`); untrusted origins are rejected with `403`.
- **Security Headers**: Strict Content-Security-Policy (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Strict-Transport-Security` (HSTS in production).
- **WAF / Scanner & Secret File Blocking**: Immediate `403` for automated scanners (`sqlmap`, `nikto`, `nuclei`, `acunetix`), prototype/operator injection (`$where`, `__proto__`, `constructor.prototype`), and direct HTTP probes to `/server.ts`, `/.env`, `/drizzle/*`, `/src/*`, or `/*.md`.
- **Immutable Audit Ledger**: Every login, admin verification, role grant, donor contact unmasking, IDOR block, and SOS lifecycle transition writes an entry to `audit_logs` with HMAC-salted IP hash.

---

## 6. Android APK Hardening

- `android:usesCleartextTraffic="false"` and `network_security_config.xml` (`cleartextTrafficPermitted="false"`, system CA trust anchors only).
- `android:allowBackup="false"` and `android:fullBackupContent="false"` to prevent ADB backup extraction of WebView storage.
- Minimal permissions (`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`) and explicit Android 11+ `<queries>` for `tel:`, `smsto:`, `https:`, WhatsApp, and Facebook.
- Release signing keys read strictly from CI/local environment variables (`ANDROID_KEYSTORE_*`) — never hardcoded in Gradle or committed to Git.
