# BloodSearch — Neon PostgreSQL Database Architecture

## 1. Authoritative Architectural Decision

**Neon PostgreSQL** is the **sole primary relational database** for all new BloodSearch application records.

To preserve working authentication, real-time push infrastructure, and zero-trust credential isolation, BloodSearch uses a strictly partitioned service architecture:

| Layer / Responsibility | Selected Technology | Rationale & Boundary |
| :--- | :--- | :--- |
| **Primary Application Data** | **Neon PostgreSQL (Serverless Postgres 16/17)** | ACID transactions, relational foreign keys, `CHECK` constraints, donor PII vault separation (`private_contacts`), paginated geospatial search, and immutable audit trails (`audit_logs`). |
| **ORM & SQL Migration Layer** | **Drizzle ORM (`drizzle-orm`) + `drizzle-kit`** | Zero-overhead TypeScript SQL builder, 100% parameterized queries, deterministic SQL DDL migrations (`/drizzle/*.sql`), and seamless compatibility with both `pg.Pool` (Neon pooled TCP/TLS) and embedded PostgreSQL 16 (`@electric-sql/pglite`) for automated CI verification. |
| **User Identity & Authentication** | **Firebase Authentication** | Preserves existing user accounts, Google Sign-In, Email/Password, Phone OTP custom tokens, and cryptographic RS256 ID Tokens (`users.uid` = Firebase Auth UID). |
| **Push Notifications** | **Firebase Cloud Messaging (FCM)** | Delivers background Web Push / Android TWA emergency alerts using tokens registered in PostgreSQL `device_tokens`. |
| **Secure Backend API Gateway** | **Express.js (`server.ts` + `/api/v1/*`)** | Sole component permitted to hold `DATABASE_URL` and connect to Neon. Verifies Firebase JWTs, enforces DB-backed RBAC, rate limits requests, and masks private donor contact data. |
| **React Web / PWA / Android APK** | **Vite + React 19 SPA** | **Zero direct database access.** Communicates with PostgreSQL exclusively over HTTPS `/api/v1/*` with `Authorization: Bearer <Firebase_ID_Token>`. |

---

## 2. Zero-Exposure Security Topology

```text
[ React Web / PWA / Signed Android TWA APK ]
        │
        │  HTTPS + Firebase RS256 Bearer ID Token
        │  (NEVER holds DATABASE_URL or Neon credentials)
        ▼
[ Express.js Security Gateway (server.ts -> /api/v1/*) ]
  ├─ Sliding-window IP & UID Rate Limiter
  ├─ Firebase Admin RS256 JWT Verifier (src/server/firebaseAuthVerifier.ts)
  ├─ Server-Side RBAC Resolver (Super Owner + PostgreSQL admin_roles)
  ├─ Donor PII Vault Gate (donor_profiles vs private_contacts + user_consents)
  └─ Drizzle ORM Transactional Repository (src/db/repositories/bloodSearchRepo.ts)
        │
        │  TLS 1.2+ (sslmode=verify-full, rejectUnauthorized: true)
        │  Pooled PgBouncer Endpoint (-pooler.neon.tech)
        │  Least-Privilege Role: `bloodsearch_app` (No DDL, No audit_logs DELETE)
        ▼
[ Neon PostgreSQL Primary Database ]
```

---

## 3. Geospatial Donor Search Strategy (PostGIS vs Indexed Lat/Lng Haversine)

Per the architectural directive (*"Use PostGIS only after verifying that the required extension is supported by the selected Neon project and plan. Otherwise implement a suitable latitude/longitude-based search strategy"*):

1. **Runtime Extension Inspection (`src/db/neonMonitor.ts`)**:
   - Before executing radius queries, `checkPostgisAvailability(db)` inspects `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`.
2. **Default Guaranteed Strategy (`INDEXED_BOUNDING_BOX_HAVERSINE`)**:
   - **Stage 1 (Index Scan)**: Computes a tight latitude/longitude bounding box (`lat ± Δlat`, `lng ± Δlng`) against composite B-Tree index `idx_donor_geo_lat_lng (latitude, longitude)` to eliminate >98% of out-of-range rows in sub-millisecond time.
   - **Stage 2 (Exact Great-Circle Filter & Sort)**: Applies a parameterized SQL Haversine formula (`6371 * 2 * ASIN(...) <= radiusKm`) and orders matching donors by `distanceKm ASC`, `isAvailable DESC`, `isVerified DESC`, and `rating DESC`.
   - **Doorstep Privacy Fuzzing**: Public search responses round `approxLatitude` and `approxLongitude` to 3 decimal places (~110m grid) and never join `private_contacts`.
3. **Optional PostGIS Acceleration (`POSTGIS_GEOGRAPHY`)**:
   - When `drizzle/optional_postgis.sql` has been applied on the Neon project (`CREATE EXTENSION IF NOT EXISTS postgis` + GiST expression index `idx_donor_profiles_postgis_geog`), `searchPublicDonorsPaginated` automatically switches to `ST_DWithin(...::geography, radiusMeters)` and `ST_Distance`.

---

## 4. Critical ACID Transaction Boundaries

All multi-table state changes execute inside `db.transaction(async (tx) => { ... })` so partial writes can never occur:

1. **Donor Registration & Profile Sync (`upsertUserAndDonorProfileTx`)**:
   - Atomically upserts `users`, `donor_profiles` (public-safe), `private_contacts` (isolated phone/WhatsApp/street vault), `user_consents` (`MEDICAL_ELIGIBILITY`), and `audit_logs`.
2. **Emergency SOS Creation (`createBloodRequestWithAlertsTx`)**:
   - Atomically inserts `blood_requests`, queries compatible available donors in the target district, dispatches `emergency_alerts` + `notifications`, and logs `SOS_REQUEST_CREATED`.
3. **Terminal Request Resolution & Cooldown (`transitionBloodRequestStateTx`)**:
   - Enforces owner/admin authorization and locks terminal states (`FULFILLED`, `CANCELLED`, `EXPIRED`) against re-transition (`409 INVALID_TERMINAL_TRANSITION`).
   - Atomically halts all open `emergency_alerts` (`STOPPED_RESOLVED`), stops `live_donor_trips`, creates a verified `donations` certificate record, increments `donor_profiles.total_donations`, sets a 90-day medical recovery cooldown (`COOLDOWN`), and writes `audit_logs`.
4. **Private Contact Unmasking & Consent (`getAuthorizedDonorPrivateContactTx` / `respondDonorContactConsentTx`)**:
   - Enforces `DND` locks and `SEEKER_CONTACT_REQUEST` consent checks while writing an immutable `UNMASK_PHONE_GRANTED` or `DENIED` record in `audit_logs` within the same transaction.
5. **Blood Bank Inventory & Super Admin RBAC (`updateBloodInventoryTx` / `manageAdminRoleTx`)**:
   - Updates stock thresholds/roles and records administrative attribution in `audit_logs`.

---

## 5. Controlled Cutover Modes (Zero Uncontrolled Dual Writes)

`DB_CUTOVER_MODE` (`src/db/neonConfig.ts`) prevents split-brain state between legacy Firestore and Neon PostgreSQL:

- `FIRESTORE_PRIMARY`: Default pre-cutover state while `DATABASE_URL` is unconfigured or migration is being prepared.
- `MIGRATION_READ_VERIFY`: Used while running `npm run db:backup-firestore`, `npm run db:migrate-firestore`, and `npm run db:verify-migration`.
- `NEON_PRIMARY`: Activated once `verify-neon-migration.ts` confirms 100% record count parity and Firebase UID preservation. All new BloodSearch `/api/v1/*` operational records commit exclusively to Neon PostgreSQL while legacy Firestore collections remain preserved read-only as historical backup.
