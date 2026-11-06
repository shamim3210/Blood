# BloodSearch — Environment Setup

Copy `.env.example` to `.env` for local work and replace every placeholder with
development-only credentials. `.env` is ignored by Git. Never place server secrets in a
`VITE_` variable: Vite embeds those values in the browser and Android bundles.

## Required production configuration

| Variable | Purpose | Where to obtain / expected format |
|---|---|---|
| `DATABASE_URL` | Pooled Neon PostgreSQL connection for API runtime | Neon Console pooled (`-pooler`) URL using `sslmode=verify-full` |
| `DIRECT_DATABASE_URL` | Direct Neon connection for Drizzle migrations and backups | Neon Console direct URL using `sslmode=verify-full` |
| `GOOGLE_CLIENT_ID` | Server-side Google OIDC audience and OAuth Web Client ID | Google Cloud Console → APIs & Services → Credentials; `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Server-side Google OAuth authorization-code exchange | The secret paired with that Web Client; never expose or prefix with `VITE_` |
| `APP_URL` | Canonical HTTPS site origin and OAuth callback origin | Deployed site origin only, e.g. `https://bloodsearch.example.org` |
| `SUPER_ADMIN_EMAIL` | Exact verified owner email allowed to hold the Super Admin role | Set by the project owner; the value alone does not grant a role |
| `AUDIT_IP_SALT` | Secret key for IP-derived audit identifiers | Generate at least 32 random bytes; store only in the platform secret manager |
| `OTP_HMAC_SECRET` | Stable secret for OTP challenge HMACs across instances | Generate a separate secret of at least 32 random bytes; store only in the platform secret manager |

`VITE_GOOGLE_CLIENT_ID` is a public identifier used by browser GIS and may match
`GOOGLE_CLIENT_ID`. It is not a client secret.

Do not set `NODE_ENV` in `.env`; Vite and the hosting platform select the build/runtime
environment. Setting it in Vite's environment file can produce an invalid production
build configuration.

The application cannot verify the actual contents of Vercel secrets or test a live
Google sign-in/Neon connection from source files. Configure all production secrets in
Vercel Project Settings → Environment Variables, select the intended environment(s),
and redeploy after changes.

## Google OAuth console settings

Create a Google OAuth 2.0 **Web application** client. Add the exact HTTPS `APP_URL`
origin under Authorized JavaScript origins and
`<APP_URL>/auth/callback` under Authorized redirect URIs. The client ID, secret, and
redirect URI must all belong to that same Web Client. Keep the consent screen and test
user/publishing state configured for the accounts that will sign in.

## Neon schema and first admin

Use the direct migration URL for `npm run db:migrate`; use the pooled URL for API
runtime. After the designated owner signs in once through Google with a verified
`SUPER_ADMIN_EMAIL`, follow the least-privilege Super Admin provisioning procedure in
`DATABASE_MIGRATION_GUIDE.md`.

## Optional integrations

- `SMS_PROVIDER` and the matching Twilio or webhook credentials are needed only when
  that SMS gateway is enabled.
- `OTP_SMS_PROVIDER` and its provider-specific values configure OTP delivery.
- `ANDROID_KEYSTORE_*` values are required only when signing Android release builds.
- `VITE_API_BASE_URL` is only needed when the app is served separately from its API.
- `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`, and
  `DB_STATEMENT_TIMEOUT_MS` tune the database pool.

Keep local database connections pointed at a development Neon project. Do not copy
production donor data or production credentials into a developer machine or test run.
