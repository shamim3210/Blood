# BloodSearch — Neon PostgreSQL Setup & Free Plan Guide

## 1. Verified Neon Free Plan Specifications & Limitations

Verified against official Neon documentation (`neon.com/docs`):

| Resource / Feature | Verified Neon Free Plan Specification | Operational Impact on BloodSearch | Mitigation Implemented |
| :--- | :--- | :--- | :--- |
| **Storage Capacity** | **1 GB (1,024 MiB)** total per project | Exceeding 1 GB blocks new writes until upgraded or pruned. | `src/db/neonMonitor.ts` queries `pg_database_size(current_database())` and raises `WARNING_75_PERCENT` at **768 MiB** and `CRITICAL_90_PERCENT` at **921.6 MiB**. |
| **Compute Hours** | **100 CU-hours / month** per project | Supports continuous development/testing or moderate traffic with scale-to-zero; sustained 24/7 un-suspended 0.25 CU requires ~180 CU-h/month. | Pooled PgBouncer + `idleTimeoutMillis: 20_000` allows clean scale-to-zero between bursts during testing. Upgrade to **Neon Launch / Scale** before nationwide 24/7 emergency launch. |
| **Autoscaling** | Up to **2 CU (8 GB RAM)** | Handles sudden SOS broadcast traffic spikes automatically. | Drizzle queries use composite indexes (`idx_donor_search_bg_dist_avail`, `idx_donor_geo_lat_lng`) to minimize CPU per search. |
| **Scale-to-Zero (Autosuspend)** | Suspends after **5 minutes** of inactivity (**cannot be disabled on Free Plan**) | First query after 5 min idle incurs a **~300–500 ms cold-start** wake-up latency. | `pg.Pool` sets `connectionTimeoutMillis: 12_000` so cold wakes never fail, and `neonMonitor.ts` flags `coldStartLikely` when latency > 320 ms. |
| **Connection Pooling** | Built-in **PgBouncer** (`-pooler` hostname, transaction mode, up to 10,000 client connections) | Prevents connection exhaustion across serverless/container instances. | `validateAndNormalizeNeonUrl` verifies `-pooler` for `DATABASE_URL` and reserves unpooled `DIRECT_DATABASE_URL` strictly for DDL migrations and backups. |
| **Branching** | Up to **10 branches** per project | Enables isolated dev/staging/restore testing branches without extra cost during Free tier evaluation. | Recommended: separate Neon projects (or isolated branches with distinct roles) for `development` vs `production`. |
| **Point-in-Time Restore (PITR)** | **6 hours** of restore history + **1 manual snapshot** | Accidental corruption noticed >6 hours later cannot be restored via Free Plan PITR alone! | Scheduled external logical backups (`npm run db:backup` -> SHA-256 verified JSON / `pg_dump`) documented in `BACKUP_RECOVERY.md`. |
| **IP Allowlist & Private Networking** | **Unavailable on Free Plan** (IP Allowlist & AWS PrivateLink require **Neon Scale** plan) | Public Neon endpoint is reachable on port 5432 TLS if credentials leak. | Enforced **backend-only access**, `sslmode=verify-full`, Vite `VITE_*` credential build blocker, least-privilege `bloodsearch_app_runtime` role (`/drizzle/least_privilege_roles.sql`), and strict API rate limiting. |

> **Production Readiness Warning**: While the **Neon Free Plan** is ideal for development, staging, and migration testing, **do not rely on the Free Plan for 24/7 nationwide life-critical emergency production workloads** due to the 100 CU-hour monthly cap, mandatory 5-minute cold-start suspend, 6-hour PITR window, and absence of IP Allowlisting. Upgrade production to **Neon Launch** (to disable autosuspend and extend PITR to 7 days) or **Neon Scale** (for IP Allowlisting, PrivateLink, and 14–30 day PITR).

---

## 2. Step-by-Step Neon Project Provisioning

### Step 1: Create Separate Development and Production Projects
1. Sign in to [Neon Console](https://console.neon.tech).
2. Create two isolated projects in the region closest to your Express backend (`aws-ap-southeast-1` Singapore for Bangladesh low-latency routing):
   - `bloodsearch-dev` (Neon Free Plan — development, CI, and migration rehearsals)
   - `bloodsearch-prod` (Neon Launch/Scale recommended for live emergency workloads)
3. Select PostgreSQL **16** or **17**.

### Step 2: Create Least-Privilege Database Roles
1. As `neondb_owner`, create the application role in the Neon SQL Editor with `CREATE ROLE bloodsearch_app_runtime LOGIN;`. Do not create it through the Neon Roles UI: Console-created roles may inherit `neon_superuser`.
2. Set an unexposed temporary password without putting a password literal in SQL history:
   ```sql
   DO $$
   DECLARE initial_password text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
   BEGIN
     EXECUTE format('ALTER ROLE bloodsearch_app_runtime PASSWORD %L', initial_password);
   END
   $$;
   ```
3. Use the role's **Reset password** action in Neon Console to generate the password to keep. Store it only in a password manager and backend secret settings; do not query or save the temporary password.
4. Keep the owner role for schema migrations and database grants through a trusted direct connection. Never use the owner connection for the application API or store it in Vercel.
5. Do not put database passwords in SQL files, SQL editor history, Git, screenshots, APKs, or chat.

### Step 3: Copy Pooled vs Direct Connection Strings with `sslmode=verify-full`
From the Neon Console **Connection Details** panel:
- **Runtime Pooled URL (`DATABASE_URL`)** — toggle **Connection pooling ON** (`-pooler` in hostname) and select role `bloodsearch_app_runtime`:
  ```text
  postgresql://bloodsearch_app_runtime:<STRONG_PASSWORD>@ep-<endpoint>-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full
  ```
- **Migration Direct URL (`DIRECT_DATABASE_URL`)** — use the `neondb_owner` connection only in a trusted local migration environment; do not add it to Vercel or other application runtime settings.

### Step 4: Configure Server Secrets & Apply Schema Migrations
1. Add only the pooled runtime `DATABASE_URL` to backend server secrets (AI Studio Secrets / Cloud Run Secret Manager). Keep `DIRECT_DATABASE_URL` with the owner credential in a trusted local migration environment only. **Never** add either URL to `.env.example`, GitHub, or `VITE_*` variables.
2. Run the deterministic Drizzle SQL migration:
   ```bash
   npm run db:migrate
   ```
3. As `neondb_owner`, execute `/drizzle/least_privilege_roles.sql` after the migration to apply runtime grants and make `audit_logs` append-only for the API role. Re-run it after schema changes that add tables.
4. *(Optional)* If you want native PostGIS GiST indexing in addition to the built-in indexed Lat/Lng Haversine search, execute `/drizzle/optional_postgis.sql` via `DIRECT_DATABASE_URL`. `src/db/neonMonitor.ts` will automatically detect `postgis` in `pg_extension` and switch `activeGeoStrategy` to `POSTGIS_GEOGRAPHY`.

### Step 5: Verify Health & Free Plan Telemetry
Query the backend health endpoint as Super Admin (`shamimrakib015@gmail.com`):
```bash
curl -H "Authorization: Bearer <SUPER_ADMIN_FIREBASE_ID_TOKEN>" http://localhost:3000/api/v1/db/health
```
Confirm:
- `status: "HEALTHY"`
- `connection.isPooledEndpoint: true`
- `connection.sslMode: "verify-full"`
- `storage.thresholdState: "OK"`
