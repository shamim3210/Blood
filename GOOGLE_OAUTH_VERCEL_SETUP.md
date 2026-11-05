# BloodSearch Google OAuth — Vercel Setup & Live Verification

## Why Google Login currently fails

The backend deliberately refuses to start the Google authorization flow unless it can read both server-side variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The client ID may also be exposed as `VITE_GOOGLE_CLIENT_ID` for browser-side Google Identity Services, but the client secret must **never** use a `VITE_` prefix.

## Configure Vercel

In Vercel → BloodSearch project → Settings → Environment Variables, add the following to **Production**, and also Preview/Development if those environments are used:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web application Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Matching OAuth Web application Client Secret |
| `VITE_GOOGLE_CLIENT_ID` | Same Client ID (public identifier only) |
| `APP_URL` | Canonical deployed origin, e.g. `https://your-project.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact trusted origins; include canonical site origin and Capacitor origins if needed |
| `DATABASE_URL` | Neon pooled runtime connection string |
| `DIRECT_DATABASE_URL` | Neon direct connection string for migrations/backup |

Do not paste secrets into source files, GitHub, chat, screenshots, or browser-visible `VITE_` variables.

## Configure Google Cloud Console

1. Open Google Cloud Console → APIs & Services → Credentials.
2. Create/select an OAuth 2.0 Client ID with application type **Web application**.
3. Add the exact canonical website origin under Authorized JavaScript origins, for example `https://your-project.vercel.app`.
4. Add the exact redirect URI under Authorized redirect URIs:
   `https://your-project.vercel.app/auth/callback`
5. Save, then copy the matching Client ID and Client Secret into Vercel as above.
6. Ensure the OAuth consent screen is configured and the account used for testing is permitted by its publishing/test-user settings.

## Deploy and test

1. Save the variables in Vercel.
2. Trigger a new Production deployment (environment variable changes do not alter an already-built deployment automatically).
3. Open the deployed site in a private/incognito browser window.
4. Open Developer Tools → Network and reload.
5. Inspect `GET /api/v1/auth/config` (never expose its cookies or tokens). Expected safe booleans:
   - `googleClientIdConfigured: true`
   - `googleOauthPopupConfigured: true`
6. Click Google Sign-In. Expected flow: `/api/v1/auth/google/url` returns `ok: true`; browser redirects/pops to Google; Google returns to `/auth/callback`; backend validates state, nonce and ID token; session is established.
7. Confirm `/api/v1/auth/session` returns the authenticated user and then test logout/revocation.

If `googleClientIdConfigured` is false, the Client ID is absent from the deployed server environment or the wrong Vercel environment was selected. If the ID is true but `googleOauthPopupConfigured` is false, the Client Secret is missing. If both are true but Google returns `redirect_uri_mismatch`, the Google Cloud redirect URI and `APP_URL` do not match exactly.

## Security notes

- OAuth callback origin is selected only from `APP_URL` / `CORS_ALLOWED_ORIGINS`; arbitrary request query parameters are not trusted for the callback destination.
- Production auth sandbox must remain disabled.
- `SUPER_ADMIN_EMAIL` is server-only. Do not define `VITE_SUPER_ADMIN_EMAIL`.
- Admin privileges require an active server-side `SUPER_ADMIN` row in Neon `admin_roles`; setting an email variable alone is not sufficient.
- Never share OAuth secrets, session cookies, authorization codes, ID tokens, CSRF tokens or Neon connection strings.

## Verification limitation

A real Google login cannot be certified from source code alone. It requires the operator's own Google OAuth credentials, Vercel environment configuration, deployed domain and an interactive sign-in with a permitted Google account. This source package has not been live-tested against the owner's Vercel project.
