# BLOODSEARCH v2.5.0 — PRODUCTION DEPLOYMENT & NEON SETUP GUIDE

## 1. Architecture Overview

- **Frontend**: React 19 + TypeScript + Vite 8 PWA (`dist/`) + Capacitor 8 Android (`android/`)
- **Backend API**: Node.js + Express (`server.ts` / serverless adapter `api/index.ts`)
- **Primary Database**: Neon Serverless PostgreSQL (28 tables managed by Drizzle ORM)
- **Authentication**: Google Identity Services / OIDC (`RS256` JWKS + single-use nonce) + Scrypt Email/Password + BTRC-ready Bangladesh Phone OTP + SHA-256 Opaque Sessions

---

## 2. Step-by-Step Neon PostgreSQL Provisioning

1. Create a new project in [Neon Console](https://console.neon.tech) (recommended region: **AWS Singapore `ap-southeast-1`** for lowest latency in Bangladesh).
2. As `neondb_owner`, create `bloodsearch_app_runtime` with SQL (`CREATE ROLE bloodsearch_app_runtime LOGIN;`). Do not create it through the Neon Roles UI because Console-created roles may inherit `neon_superuser`.
3. Set an unexposed temporary password using a SQL `DO` block that generates it with `gen_random_uuid()`; then use the role's **Reset password** action in Neon Console to generate the password to keep. Do not query or save the temporary password. Store the final password only in a password manager and backend secret settings.
4. Copy a **pooled connection string** (`-pooler` hostname) with `?sslmode=verify-full`, using `bloodsearch_app_runtime`, and set it as `DATABASE_URL`. Keep the `neondb_owner` direct connection only in a trusted local migration environment; never put it in Vercel or another application runtime.
5. Apply the 28-table schema migration:
   ```bash
   npm run db:migrate
   ```
6. As `neondb_owner`, run `drizzle/least_privilege_roles.sql` to apply the runtime grants and prevent the API role from changing or deleting audit rows. Run it again after migrations that add tables. Production startup verifies the schema but never runs DDL; migrations must use a trusted direct owner connection.

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
`vercel.json` and `api/index.ts` route `/api/*`, `/auth/callback`, and `/version.json` to the Express handler while serving static PWA assets from `dist/`.
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
