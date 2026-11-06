# BloodSearch — Focused Login & Security Review (2026-11-06)

## Confirmed cause of the Google login message

The backend deliberately reports Google OAuth as unavailable when it cannot read both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The repository contains placeholders only; no real `.env` or OAuth secret was present in the uploaded ZIP. This cannot be fixed by changing the app name or rebuilding the APK. The owner must add the real OAuth Web Client values to the Vercel project's server-side Environment Variables and redeploy.

## High-impact findings fixed in this review

1. **Unauthenticated synthetic Super Admin login**: the `/api/v1/auth/google/sandbox-login` endpoint previously accepted a caller-supplied email and minted a Neon session. It is now disabled by default and returns 404 in Production or Vercel Production. It can only be enabled explicitly with `BLOODSEARCH_ENABLE_AUTH_SANDBOX=true` in non-production.
2. **Synthetic OAuth callback identity**: the `/auth/callback?mockEmail=...` branch previously accepted synthetic identities. It now has the same production and opt-in guard.
3. **Public Admin shortcut in login UI**: the “1-Click Super Admin Login” link was rendered in production. It is now rendered only in Vite development mode.
4. **Silent fake-login fallback**: real Google login previously fell back to synthetic login when the OAuth endpoint failed, the popup was blocked, or the user closed it. It now surfaces the actual error and never silently changes identity.
5. **Vercel OAuth callback routing**: explicit rewrites were added for `/auth/callback` and the development-only `/auth/google-sandbox` Express routes.
6. **Environment template mismatch**: the CORS and SMS environment variable names in `.env.example` were corrected to match the code.

## Required Vercel configuration (owner action)

In Vercel → Project → Settings → Environment Variables, configure the following for the intended deployment environment(s):

- `GOOGLE_CLIENT_ID` = Google Cloud OAuth 2.0 **Web application** Client ID.
- `GOOGLE_CLIENT_SECRET` = matching OAuth Web Client secret. Server-only; never prefix with `VITE_`.
- `VITE_GOOGLE_CLIENT_ID` = same Client ID (public browser identifier).
- `APP_URL` = exact deployed origin, e.g. `https://your-project.vercel.app` (no trailing slash).
- `CORS_ALLOWED_ORIGINS` = exact allowed site origins, comma-separated.
- `DATABASE_URL` = Neon pooled runtime connection string (`-pooler`, `sslmode=verify-full`).
- `DIRECT_DATABASE_URL` = Neon direct migration connection string (`sslmode=verify-full`); needed for migrations, not normal web requests.
- `SUPER_ADMIN_EMAIL` = the intended owner email, spelled exactly.
- `OTP_HMAC_SECRET` = independently generated random secret of at least 32 characters if OTP is enabled.
- Keep `BLOODSEARCH_ENABLE_AUTH_SANDBOX` unset or `false` in all hosted environments.

In Google Cloud Console, use the same OAuth Web Client and add the exact deployed origin under Authorized JavaScript origins and `https://YOUR-DEPLOYED-DOMAIN/auth/callback` under Authorized redirect URIs. Then redeploy Vercel so the function receives the variables. Do not paste the client secret into chat or commit it to GitHub.

## Initial ZIP review status and limitations (historical)

- ZIP archive integrity: passed before extraction.
- Android debug APK and unsigned release APK already present in the uploaded ZIP: both passed `unzip -t`; they were not rebuilt in this review.
- TypeScript parser syntax checks for the five modified TypeScript/TSX files: zero parse diagnostics.
- `vercel.json`: valid JSON.
- `npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps`: timed out twice in this environment.
- `npm run lint`: could not complete because the timed-out install left incomplete `@types` packages.
- `npm test`: could not run because the local `tsx` executable was not installed.
- `npm run build`: not verified.
- No live Vercel environment variables, Google Cloud OAuth console settings, or production deployment access were supplied; therefore live Google sign-in cannot be verified from this ZIP alone.

The prior `TESTING_REPORT.md` is a report shipped inside the user's ZIP; its historical claims were not independently reproduced during the initial ZIP review. Current source verification is recorded below.

## Current Source Review Findings & Verification

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `src/server/authAndSessionService.ts` | 643-683 | An email/password registration could claim an existing Google-only account without proving control of the Google identity. **Fixed:** registration now refuses to attach a password identity unless a matching password identity already exists and its password verifies. | 9/10 |
| 2 | 🟠 HIGH | `server.ts`; `src/services/bloodSearchService.ts` | 410-445; 1140-1205 | OAuth popup messages carried session tokens using wildcard target origin and were accepted without checking popup origin/source. **Fixed:** callback posts only to the configured callback origin and the client validates both origin and popup source. | 9/10 |
| 3 | 🟡 MEDIUM | `src/server/otpService.ts` | 140-170 | A random per-instance OTP HMAC key made OTP verification fail across serverless instances and restarts when the configured secret was absent. **Fixed:** production requires a stable, non-placeholder `OTP_HMAC_SECRET`; the random fallback remains development-only. | 9/10 |
| 4 | 🟡 MEDIUM | `src/server/authAndSessionService.ts`; `server.ts` | 48-68; 226-231 | IP-derived audit identifiers could use an unsalted hash when the salt was not configured. **Fixed:** IP identifiers use HMAC when configured and production app initialization rejects a missing/placeholder `AUDIT_IP_SALT`. | 8/10 |

### Current validation

- `npm run lint`: passed (`tsc --noEmit`).
- `npm test`: passed, 41 tests, 0 failures.
- `npm run build`: passed. Vite emitted a warning because the ignored local `.env` sets `NODE_ENV=production`; the checked-in `.env.example` was corrected not to set it.
- `npx drizzle-kit check --config=drizzle.config.ts`: passed.
- `vercel.json` and `package.json` parsed successfully.
- Serverless configuration failures now return HTTP 503 rather than success-shaped
  empty donor/contact results; the failure behavior has a regression test.
- Fixed a realtime event format mismatch and SSE event-name mismatch that prevented
  pushed updates from reaching listeners; removed a page-level handler that suppressed
  WebSocket/Vite unhandled rejections.

### Remaining manual actions

- Replace local/deployment placeholders for `DATABASE_URL`, `DIRECT_DATABASE_URL`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUDIT_IP_SALT`, and `OTP_HMAC_SECRET`.
- Confirm the deployment's `SUPER_ADMIN_EMAIL` and provision the corresponding
  verified Google identity with an active Super Admin row in Neon.
- Add the exact HTTPS origins and `/auth/callback` URI to the matching Google OAuth
  Web Client, set Vercel production environment variables, and redeploy.
- Run live Neon health checks and a production Google sign-in after configuration.
- Use a persistent Node host (or an external realtime service) for guaranteed
  WebSocket/SSE emergency alert delivery; Vercel does not support the native WebSocket
  upgrade listener.
- Rebuild and sign Android release artifacts only after production API configuration
  and signing credentials are supplied.

These are source-level and automated-test results, not a live penetration test or
certification of production readiness.
