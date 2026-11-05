# BLOODSEARCH v2.5.0 — PRODUCTION DEPLOYMENT & NEON SETUP GUIDE

## 1. Architecture Overview

- **Frontend**: React 19 + TypeScript + Vite 8 PWA (`dist/`) + Capacitor 8 Android (`android/`)
- **Backend API**: Node.js + Express (`server.ts` / serverless adapter `api/index.ts`)
- **Primary Database**: Neon Serverless PostgreSQL (28 tables managed by Drizzle ORM)
- **Authentication**: Google Identity Services / OIDC (`RS256` JWKS + single-use nonce) + Scrypt Email/Password + BTRC-ready Bangladesh Phone OTP + SHA-256 Opaque Sessions

---

## 2. Step-by-Step Neon PostgreSQL Provisioning

1. Create a new project in [Neon Console](https://console.neon.tech) (recommended region: **AWS Singapore `ap-southeast-1`** for lowest latency in Bangladesh).
2. Open the Neon SQL Editor as `neondb_owner` and run `drizzle/least_privilege_roles.sql` (replacing the placeholder passwords with strong 32-byte secrets) to create:
   - `bloodsearch_migrator` (DDL migration role)
   - `bloodsearch_app_runtime` (least-privilege DML runtime role)
3. Copy two connection strings from Neon:
   - **Pooled connection string** (`-pooler` hostname) with `?sslmode=verify-full` -> set as `DATABASE_URL` using `bloodsearch_app_runtime`.
   - **Direct connection string** (non-pooler hostname) with `?sslmode=verify-full` -> set as `DIRECT_DATABASE_URL` using `bloodsearch_migrator`.
4. Apply the 28-table schema migration:
   ```bash
   npm run db:migrate
   ```
   *(Note: On first cold start, `server.ts` also verifies core tables idempotently if permissions allow, and exposes health metrics at `GET /api/v1/db/health`.)*

---

## 3. Google Cloud Console OAuth 2.0 / OIDC Configuration

1. Open [Google Cloud Console -> APIs & Services -> Credentials](https://console.cloud.google.com/apis/credentials).
2. Configure the **OAuth Consent Screen** (User Type: External, Scopes: `openid`, `email`, `profile`).
3. Create **OAuth Client ID** -> Application Type: **Web application**.
4. Add **Authorized JavaScript Origins**:
   - Your production domain (e.g., `https://bloodsearch.bd`)
   - AI Studio preview origins if testing in preview:
     - `https://ais-dev-mwf6m2egm6cqhoe3tewtqq-964553073923.asia-east1.run.app`
     - `https://ais-pre-mwf6m2egm6cqhoe3tewtqq-964553073923.asia-east1.run.app`
5. Add **Authorized Redirect URIs**:
   - `https://<YOUR_PRODUCTION_DOMAIN>/auth/callback`
   - `https://ais-dev-mwf6m2egm6cqhoe3tewtqq-964553073923.asia-east1.run.app/auth/callback`
   - `https://ais-pre-mwf6m2egm6cqhoe3tewtqq-964553073923.asia-east1.run.app/auth/callback`
6. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `VITE_GOOGLE_CLIENT_ID` in your hosting environment.
   - In Vercel: Project → Settings → Environment Variables. Add all three to **Production, Preview, and Development** as appropriate. `GOOGLE_CLIENT_SECRET` must be a server-only variable (do not prefix it with `VITE_`). Set `APP_URL` to the exact deployed origin. In Google Cloud Console, add the exact redirect URI `https://YOUR-DOMAIN/auth/callback` to the same Web OAuth client. Redeploy after saving. Keep `BLOODSEARCH_ENABLE_AUTH_SANDBOX=false` (or unset) on every hosted environment.

---

## 4. Deploying the Full-Stack Application

### Option A: Google Cloud Run / Render / Railway / VPS (Recommended for Persistent SSE + Express)
```bash
npm ci
npm run build
NODE_ENV=production PORT=3000 npx tsx server.ts
```
Verify live health:
```bash
curl -sS https://<YOUR_DOMAIN>/api/v1/db/health
curl -sS https://<YOUR_DOMAIN>/version.json
```

### Option B: Vercel Full-Stack Deployment
`vercel.json` and `api/index.ts` route `/api/*` and `/auth/callback` through the Express handler while serving static PWA assets from `dist/`. The OAuth callback is explicitly rewritten to the serverless Express function; do not remove that rewrite.
Set all variables from `.env.example` in **Vercel Project Settings -> Environment Variables** and deploy with `vercel --prod`.

---

## 5. Logical Backup, Verification & Rollback

- **Create SHA-256 Verified 28-Table Logical Backup**:
  ```bash
  npm run db:backup
  ```
- **Verify Backup Integrity & Roundtrip Restore**:
  ```bash
  npm run db:restore-verify -- backups/<backup-file>.json
  ```
- **Emergency Schema Rollback (Destructive — Fresh/Staging Only)**:
  Execute `drizzle/rollback_0000_drop_all.sql` only after exporting and verifying a logical backup.
