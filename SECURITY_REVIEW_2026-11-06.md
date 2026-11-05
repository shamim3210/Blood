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

## Verification status and limitations

- ZIP archive integrity: passed before extraction.
- Android debug APK and unsigned release APK already present in the uploaded ZIP: both passed `unzip -t`; they were not rebuilt in this review.
- TypeScript parser syntax checks for the five modified TypeScript/TSX files: zero parse diagnostics.
- `vercel.json`: valid JSON.
- `npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps`: timed out twice in this environment.
- `npm run lint`: could not complete because the timed-out install left incomplete `@types` packages.
- `npm test`: could not run because the local `tsx` executable was not installed.
- `npm run build`: not verified.
- No live Vercel environment variables, Google Cloud OAuth console settings, or production deployment access were supplied; therefore live Google sign-in cannot be verified from this ZIP alone.

The prior `TESTING_REPORT.md` is a report shipped inside the user's ZIP; its historical claims were not independently reproduced in this review. Do not treat it as a fresh test run.
