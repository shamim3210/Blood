# BloodSearch — Environment Configuration & Secret Isolation Guide

## 1. Strict Frontend vs. Backend Variable Separation

BloodSearch enforces a hard cryptographic and build-time boundary between public browser/APK configuration (`VITE_*`) and private server-only secrets:

### NEVER Prefix With `VITE_` (Backend Server Secrets ONLY)
If any of the variables below are prefixed with `VITE_`, `vite.config.ts` and `src/db/neonConfig.ts` **immediately abort the build and server startup**:

| Variable Name | Required | Example / Allowed Values | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes (for Neon Primary)** | `postgresql://bloodsearch_app:<PASS>@ep-...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full` | Pooled (`-pooler`) Neon PostgreSQL connection string used exclusively by Express `server.ts`. |
| `DIRECT_DATABASE_URL` | **Yes (for Migrations/Backups)** | `postgresql://neondb_owner:<PASS>@ep-....ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full` | Direct unpooled Neon connection string used exclusively by `drizzle-kit migrate` and `pg_dump`. |
| `DB_CUTOVER_MODE` | Optional | `FIRESTORE_PRIMARY` \| `MIGRATION_READ_VERIFY` \| `NEON_PRIMARY` | Controls controlled migration cutover without dual-write corruption. |
| `NEON_PLAN_TIER` | Optional | `FREE` \| `LAUNCH` \| `SCALE` | Configures Neon plan monitoring thresholds in `/api/v1/db/health`. |
| `DB_POOL_MAX` | Optional | `10` (range `2..25`) | Maximum `pg.Pool` client connections from Express to Neon PgBouncer. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | Service account JSON string | Used server-side for custom OTP token minting and read-only Firestore backup export (`npm run db:backup-firestore`). |
| `FCM_SERVER_KEY` | Optional | Server Push Credential | Used exclusively by `server.ts` for background FCM emergency notifications. |
| `OTP_HMAC_SECRET` | Optional | 32-byte hex secret | Server-side HMAC secret for Bangladesh mobile OTP hashing. |
| `ANDROID_APK_SHA256_FINGERPRINT` | Recommended | `AA:BB:CC:...` (32 hex bytes) | Cryptographically binds `/.well-known/assetlinks.json` to your signed Android APK. |

---

### Safe Public Frontend Variables (`VITE_*`)
Only non-secret public branding and client SDK identifiers may use `VITE_`:

- `VITE_BRAND_NAME`, `VITE_BRAND_TAGLINE`, `VITE_ORG_NAME`, `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_EMAIL`
- `VITE_FIREBASE_VAPID_KEY` (Public Web Push VAPID key)
- `VITE_RECAPTCHA_V3_SITE_KEY` (Public Firebase App Check site key)

---

## 2. Environment Isolation (Development vs. Staging vs. Production)

1. **Local Development (`NODE_ENV=development`)**:
   - Copy `.env.example` to `.env.local` (gitignored).
   - Point `DATABASE_URL` and `DIRECT_DATABASE_URL` to your dedicated **`bloodsearch-dev`** Neon Free Plan project (never connect a developer laptop to the production donor database).
2. **Automated Testing (`NODE_ENV=test` / `npm test`)**:
   - Uses isolated in-memory embedded PostgreSQL 16 (`@electric-sql/pglite`) with zero external network calls and zero risk to cloud data.
3. **Production (`NODE_ENV=production`)**:
   - Inject `DATABASE_URL` and `DIRECT_DATABASE_URL` via managed platform secrets (AI Studio Secrets / Google Cloud Run Secret Manager).
   - Dev OTP Sandbox is automatically disabled when `NODE_ENV=production`.
   - `Strict-Transport-Security` (HSTS), `Content-Security-Policy` (CSP), and `sslmode=verify-full` are enforced.
   - Android APK communicates exclusively with the HTTPS Express domain (`https://<your-domain>/api/v1/*`) — **zero database URLs or credentials exist inside the APK**.
