# BloodSearch — Production Security Hardening, Neon Migration & Android APK Testing Report

## 1. Historical Execution Summary (Not Re-verified in This Review)

All backend, authentication, session, RBAC, IDOR, rate-limiting, emergency SOS, and backup/restore tests were executed against a **real PostgreSQL 16 database engine (`@electric-sql/pglite`)** running the generated **28-table** Drizzle DDL migration (`/drizzle/0000_bloodsearch_neon_core.sql`) and live Express HTTP endpoints (`/api/v1/*`, `/auth/callback`), alongside full Capacitor 8 + Gradle 8.14.3 / Android SDK 36 native APK builds.

| Verification Command | Scope | Result | Verified Metrics |
| :--- | :--- | :--- | :--- |
| Firebase Dependency & Artifact Purge | Entire repository, `package.json`, `node_modules`, scripts & UI | **PASS (`0` leftovers)** | `src/firebase.ts`, `firestore.rules`, `firebase.json`, `.firebaserc`, `firebase-blueprint.json`, `firebase`, and `firebase-admin` completely removed. |
| `npm run lint` (`tsc --noEmit`) | Full-Stack TypeScript Strict Typecheck | **PASS (`exit 0`)** | Zero TypeScript errors across React client, Express server, Drizzle 28-table schema, repositories, Capacitor config, and all 4 test suites. |
| `npm test` (`tsx --test --test-concurrency=1 tests/*.test.ts`) | 4 End-to-End Integration & Security Suites | **PASS (`33/33 passed`, `0 failed`)** | `emergencyContactSystem.test.ts` (9/9), `neonDatabaseSystem.test.ts` (10/10), `otpAuthSystem.test.ts` (10/10), `productionHardeningAndOidc.test.ts` (4/4). |
| `npm run build` (`vite build`) | Production Web & PWA Bundle | **PASS (`exit 0`)** | Conflict-free Workbox precache (`0` `.map` files in `dist/`, `0` credential or secret leaks). |
| `./android/gradlew -p android :app:assembleDebug :app:assembleRelease` | Native Android APK Compilation (JDK 21 + Android SDK 36) | **PASS (`188/188 tasks`)** | `BloodSearch-debug.apk` (**11 MB**, `unzip -t` OK) & `BloodSearch-release-unsigned.apk` (**9.2 MB**, `unzip -t` OK). |
| Live Runtime Smoke Check (`http://127.0.0.1:3000`) | Express + Vite Middleware + Health & Version Routes | **PASS (`HTTP 200`)** | `/` -> `200`, `/version.json` -> `200`, `/api/v1/db/health` -> `200 HEALTHY (NEON_PRIMARY)`. |

---

## 2. Compiled Android APK Integrity Hashes

| Artifact | Size | Archive Verification (`unzip -t`) | SHA-256 Digest |
| :--- | :--- | :--- | :--- |
| `BloodSearch-debug.apk` | `11 MB` | **OK (`No errors detected`)** | `de65376ddb2345ad4be6230079c05ae3c22dd76be8fe5844aebab03a0a96412b` |
| `BloodSearch-release-unsigned.apk` | `9.2 MB` | **OK (`No errors detected`)** | `a0f23bd2bb65e476dc5d7c12ba933097aab48b67b52d0c8709085099f1669187` |

---

## 3. Detailed Suite Breakdown (33/33 Passing Tests)

### A. `tests/productionHardeningAndOidc.test.ts` (`4/4 PASS`)
1. **Google OIDC RS256 JWKS Verification & Single-Use Nonce Replay Protection**:
   - Rejects forged RSA signatures (`401`), wrong `aud` client IDs (`401`), and `email_verified: false` tokens (`401`).
   - Accepts valid RS256 Google ID tokens, issues `HttpOnly` session cookies + `bs_sess_...` opaque tokens + 256-bit `csrfToken`, stores only SHA-256 `sessionTokenHash` in `login_sessions` (zero plaintext tokens in DB), and blocks single-use `nonce` replay (`401`).
2. **Cookie CSRF Protection, Capacitor Bearer Auth, Logout Revocation & Account Status Lock**:
   - Verifies `scrypt$` salted password hashing in `auth_identities`, blocks cookie-authenticated `POST` mutations missing `X-CSRF-Token` (`403`), permits valid `X-CSRF-Token` (`201`), supports `Authorization: Bearer bs_sess_...` for the Android APK (`200`), blocks `SUSPENDED` accounts immediately (`401`/`403`), and revokes sessions upon `/api/v1/auth/logout` (`401`).
3. **5-Attempt Brute-Force Lockout, Anti-Enumeration Reset & Session Rotation**:
   - Locks accounts after 5 failed password logins (`423`/`429`), returns uniform `200` on unknown-email password reset requests, enforces single-use SHA-256 reset token consumption, and rotates/revokes prior sessions upon password change.
4. **PostgreSQL Distributed Rate Limiting, Capacitor CORS Allowlist & Direct Chat IDOR Isolation**:
   - Enforces multi-instance `rate_limit_buckets` windows in PostgreSQL, permits `Origin: capacitor://localhost`, allows room participants A & B to exchange direct messages (`201`/`200`), and blocks non-participant intruder C with `403`.

### B. `tests/neonDatabaseSystem.test.ts` (`10/10 PASS`)
- Verifies all **28 PostgreSQL tables** (21 core + 7 parity tables), foreign keys, `CHECK` constraints, Neon `sslmode=verify-full` TLS enforcement, credential redaction, Haversine geospatial donor search with zero raw phone exposure, SQLi & `$where`/prototype injection defenses, private contact vault (`DND` & `REQUEST_ONLY` consent gates + `UNMASK_PHONE_GRANTED` audit trail), Super Admin vs. Co-Admin RBAC boundaries, 5-attempt `/api/v1/auth/admin-verify` brute-force lockout (`429 ADMIN_BRUTE_FORCE_LOCKED`), ACID SOS dispatch & 90-day donation cooldowns, and SHA-256 verified 28-table logical backup & lossless restore roundtrip.

### C. `tests/emergencyContactSystem.test.ts` (`9/9 PASS`)
- Verifies donor availability ranking, opted-in Call/WhatsApp href builders, multi-donor SOS radius escalation without duplicate spam, cross-user audit isolation, fuzzy Bangladesh hospital coordinate resolution (`"Squire hospital"` -> Square Hospital Dhaka), live donor GPS trip tracking with pair isolation, and Leaflet HTML tooltip XSS escaping (`escapeHtml()`).

### D. `tests/otpAuthSystem.test.ts` (`10/10 PASS`)
- Verifies Bangladesh mobile E.164 normalization (ASCII + Bangla digits across GP, Robi, Banglalink, Airtel, Teletalk), salted HMAC-SHA256 OTP digests, 5-attempt OTP lockout, 300s expiry, 60s resend cooldown, per-phone & per-IP rate limits, strict production lock disabling Dev Sandbox OTP (`403 DEV_OTP_DISABLED_IN_PRODUCTION`), SSRF-guarded SMS gateway adapters (`W3SMS`, `ZENDSMS`, `BTRC_CUSTOM`), and zero Firebase remnants across the codebase.


## 4. Initial ZIP Review Addendum (2026-11-06; historical)

See `SECURITY_REVIEW_2026-11-06.md` for the focused Google login and security review. The historical test claims above were not independently reproduced in this review. Dependency installation timed out, so current lint, full tests, and production build could not be rerun. The existing APK files were integrity-checked but not rebuilt.

## 5. Current Source Review & Verification (2026-11-07)

The historical results in sections 1–3 are not treated as current evidence. These
checks were run against the current local workspace:

| Command / check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** |
| `npm test` | **PASS: 43 tests, 0 failures** |
| `npm run build` | **PASS** |
| `npm run apk:build` | **PASS**; web production build and Capacitor Android sync completed |
| Android Gradle `:app:assembleDebug` | **PASS**; debug APK signature verified with APK Signature Scheme v2 |
| Debug APK metadata | **PASS**; package `bd.bloodsearch.app`, version `2.5.0` (`versionCode 250`) |
| Debug APK copies | **MATCH**; root and `public/downloads/` copies have SHA-256 `A7198A8BBE9425FF683ED4B3913C88C13BF03FF6129156AA44601398EB1AF2D3` |
| Live website | **HTTP 200** |
| Live `/api/v1/auth/config` | **HTTP 500**; production authentication is not ready |
| Neon `production` branch / `neondb` | **0 public tables**; no application RLS policies are installed |

The local `.env` and Vercel Production environment do not have the real Neon
`DATABASE_URL` or Google OAuth client credentials. The Neon SQL Editor is reachable
as `neondb_owner`, but no schema migration was run. Google Cloud denies access to
OAuth client details (`oauthconfig.testusers.get` is missing). No production secrets
were copied into source or chat, no database records were changed, and no paid plan
or billing setting was enabled.

RLS was not enabled: the production branch currently has no application tables, and
the API does not yet establish transaction-scoped user identity for row-level
policies. Enabling RLS without matching policies/context would break API access;
the existing API performs authorization in its server-side repositories instead.
Production Google sign-in and database-backed authentication remain blocked until
the owner configures the Neon connection and authorized Google OAuth credentials in
Vercel, then deploys and verifies the result. A signed Android release APK also
requires the owner's release keystore.

Security issues found and fixed in the earlier source review:

Security issues found and fixed in this source review:
- Password registration can no longer attach a password identity to an existing
  Google-only account without proof of control of its existing sign-in method.
- OAuth callback `postMessage` now targets the configured callback origin; the client
  accepts the session-bearing message only from the expected origin and popup.
- Production startup now rejects missing or placeholder `AUDIT_IP_SALT` and
  `OTP_HMAC_SECRET`, preventing unsalted audit-IP hashes and per-instance OTP keys.
- Serverless API initialization failures now return HTTP 503 rather than success-shaped
  empty donor/contact results.
- WebSocket/SSE event parsing now consumes the server's `type` event shape and the
  actual default SSE `message` event; regression tests cover valid and malformed
  messages. Removed the global `unhandledrejection` suppression that hid WebSocket
  and Vite failures from diagnostics.
- Production database startup no longer executes schema DDL using runtime
  credentials; incomplete schemas fail closed and require the explicit migrator.
- A failed local PostgreSQL startup no longer recursively deletes the persistent
  `.data` database before falling back to an in-memory instance.
- Client IP rate-limit/audit keys ignore spoofable forwarding headers outside
  Vercel, and CORS same-host checks no longer trust `X-Forwarded-Host`.

No claim of live production readiness is made. Vercel's request-scoped functions do
not support the app's native WebSocket upgrade listener; see `DEPLOYMENT_GUIDE.md`
for the realtime delivery limitation and hosting options.
