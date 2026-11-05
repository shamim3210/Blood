# BloodSearch — Neon PostgreSQL Backup & Disaster Recovery Runbook

## 1. Recovery Objectives & Free Plan Constraints

- **Verified Neon Free Plan Constraint**: Neon Free Plan retains **only 6 hours** of Point-in-Time Restore (PITR) WAL history and **1 manual snapshot**.
- **Risk**: Relying exclusively on Neon Free Plan PITR means a logical data issue discovered 7 hours later cannot be rolled back natively inside Neon Free tier.
- **Implemented Defense-in-Depth Backup Strategy**:
  1. **Layer 1 — Instant Neon Branch / PITR (0–6 hours on Free; 7–30 days on Launch/Scale)**: Copy-on-write instant branch restore inside Neon Console.
  2. **Layer 2 — Scheduled Application Logical Backup (`npm run db:backup`)**: Exports all **24 PostgreSQL tables** in foreign-key dependency order with canonical **SHA-256 tamper-verification manifest** (`backups/neon-backup-<timestamp>.json`).
  3. **Layer 3 — Standard PostgreSQL Native `pg_dump` (via `DIRECT_DATABASE_URL`)**: Binary custom-format PostgreSQL dump (`-Fc`) for long-term encrypted off-site archival.
  4. **Layer 4 — Preserved Read-Only Firestore Pre-Cutover Archive**: `backups/firestore-snapshot-latest.json` + untouched Firestore collections.

---

## 2. Backup Procedures

### A. Logical 24-Table SHA-256 Verified Backup (Recommended Every 4 Hours on Free Plan)
```bash
npm run db:backup
```
- Connects read-only via `DATABASE_URL` (`src/db/migrationAndBackupEngine.ts` -> `exportNeonLogicalBackup`).
- Exports all 24 tables (`users` through `audit_logs`), records exact per-table row counts, and computes `sha256Manifest`.
- Writes to `backups/neon-backup-<timestamp>.json` (excluded from Git and buyer packages via `.gitignore` and `package-buyer.mjs`).

### B. Native `pg_dump` Physical/Logical Archive (Using Direct Unpooled Endpoint)
Always run `pg_dump` against `DIRECT_DATABASE_URL` (unpooled hostname, never `-pooler`):
```bash
pg_dump "$DIRECT_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="backups/bloodsearch-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

---

## 3. Restore & Verification Procedures

### Procedure 1: Isolated Branch Restore Rehearsal (Zero Production Downtime)
1. In the **Neon Console**, create an isolated child branch `restore-verify-<date>` (Free Plan supports up to 10 branches).
2. Set `DATABASE_URL` in your local shell to the **isolated child branch** URI (never overwrite production directly without testing first).
3. Run the automated SHA-256 verified restore & count-parity validator:
   ```bash
   ALLOW_DESTRUCTIVE_RESTORE="true" npm run db:restore-verify -- backups/neon-backup-latest.json
   ```
4. What `restore-neon-verify.ts` verifies automatically:
   - Recomputes the SHA-256 digest across all 24 tables and aborts immediately (`BACKUP_INTEGRITY_FAILED`) if a single byte or count was modified.
   - Whitelists table names strictly against `ALL_BLOODSEARCH_TABLES`.
   - Restores all rows inside a single atomic `BEGIN ... COMMIT` PostgreSQL transaction in parent-before-child FK order (`users` -> `hospitals` -> `blood_banks` -> `donor_profiles` -> `private_contacts` -> ... -> `audit_logs`).
   - Resynchronizes the `audit_logs_id_seq` PostgreSQL sequence.
   - Queries `SELECT COUNT(*)` on all 24 tables and asserts `verifiedCountsMatch === true`.

### Procedure 2: Neon Point-in-Time Restore (Within 6-Hour Window on Free Plan)
1. Open **Neon Console -> Restore**.
2. Select target timestamp prior to incident (up to 6 hours back on Free Plan; up to 30 days on Scale Plan).
3. Preview data on a temporary branch first, run `npm run db:verify-migration` / health checks, then promote or switch endpoint.

---

## 4. Automated Backup & Recovery Verification Status

Backup export, SHA-256 tamper rejection, full `rollback_0000_drop_all.sql` execution, DDL re-application, and 24-table transactional restore parity are continuously tested in `tests/neonDatabaseSystem.test.ts` (Test 9) against real PostgreSQL 16 (`@electric-sql/pglite`).
