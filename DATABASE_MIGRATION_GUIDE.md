# BloodSearch — Controlled Firestore-to-Neon Migration Guide

## 1. Migration Safety Principles

1. **Zero Firestore Deletion**: Firestore collections are **never** deleted or mutated during export, migration, or verification.
2. **Firebase Authentication UID Preservation**: Every `users/{uid}` document preserves its exact Firebase Auth `uid` as `users.uid` (`VARCHAR(128) PRIMARY KEY`) in Neon PostgreSQL so existing users sign in with zero disruption.
3. **Donor Privacy Vault Separation**: Phone numbers from legacy `/donors` and `/donorDirectContacts` are extracted exclusively into `private_contacts` while `donor_profiles` stores only `masked_phone_hint` (`+88017****44`).
4. **No Uncontrolled Dual Writes**: `DB_CUTOVER_MODE` transitions deterministically (`FIRESTORE_PRIMARY` -> `MIGRATION_READ_VERIFY` -> `NEON_PRIMARY`) only after `npm run db:verify-migration` exits `0`.

---

## 2. Complete 18-Collection Firestore-to-Neon Mapping

All **18 Firestore collections** defined in `firebase-blueprint.json` were inspected and mapped losslessly in `/src/db/migrationAndBackupEngine.ts`:

| # | Legacy Firestore Path | Destination Neon PostgreSQL Table(s) | Key Mapping & Privacy Transformation |
| :--- | :--- | :--- | :--- |
| 1 | `/users/{userId}` | `users` | `_docId` -> `users.uid` (exact Firebase Auth UID), `familyCircle` -> `family_circle_json`. |
| 2 | `/admins/{userId}` | `admin_roles`, `users` | `_docId` -> `admin_roles.user_uid`, `role` -> `SUPER_ADMIN` / `CO_ADMIN` / `MODERATOR`. |
| 3 | `/adminInviteLocks/{proofHash}` | `verification_records` | `_docId` -> `proof_hash` (`UNIQUE`), `verification_type = 'ADMIN_INVITE_LOCK'`, `status = 'CONSUMED'`. |
| 4 | `/donors/{donorId}` | `donor_profiles`, `users` | Public donor metadata, manual `age` (`18..65` or `NULL`), coordinates, `masked_phone_hint`. Raw phone stripped from public profile. |
| 5 | `/donorDirectContacts/{donorId}` | `private_contacts` | `phone` -> `phone_e164`, `whatsapp` -> `whatsapp_number`, `contact_visibility` (`PUBLIC_OPT_IN` / `REQUEST_ONLY` / `DND_PRIVATE`). |
| 6 | `/contactRequests/{contactReqId}` | `user_consents` | `consent_type = 'SEEKER_CONTACT_REQUEST'`, maps `donorUid` -> `user_uid` and `requesterUid` -> `counterparty_uid`. |
| 7 | `/requests/{requestId}` | `blood_requests` | Deterministic UUID v4 derived from `_docId` + stored in `legacy_request_doc_id` (`UNIQUE`). |
| 8 | `/requestDirectContacts/{requestId}` | `blood_requests` | Merged into `contact_name`, `contact_phone_private` (masked in API unless active & opted-in or owner/admin). |
| 9 | `/requestResponses/{responseId}` | `request_responses` | Linked via `request_id` FK (`blood_requests.id`) and `donor_uid` FK (`users.uid`). |
| 10 | `/requestAlerts/{alertId}` | `emergency_alerts` | Linked via `request_id` FK and `target_donor_uid` FK; preserves escalation tier and `STOPPED_RESOLVED` state. |
| 11 | `/liveDonorTrips/{tripId}` | `live_donor_trips` | Preserves live donor GPS coordinates, hospital destination, ETA, and `trip_status`. |
| 12 | `/bloodStock/{groupId}` | `blood_banks` + `blood_inventory` | Maps central blood group stock into `BD-CENTRAL-NETWORK` bank + `blood_inventory` rows. |
| 13 | `/communityMessages/{messageId}` | `community_messages` | Preserves community chat messages with `legacy_message_doc_id` uniqueness. |
| 14 | `/directChats/{chatId}` | `direct_chat_rooms` | Preserves 1-to-1 participant UIDs (`participant_one_uid`, `participant_two_uid`). |
| 15 | `/directChats/{chatId}/messages/{messageId}` | `direct_chat_messages` | Preserves all subcollection direct messages linked via `room_id -> direct_chat_rooms.id`. |
| 16 | `/announcements/{announcementId}` | `announcements` | Preserves official blood drive and emergency broadcasts. |
| 17 | `/scamReports/{reportId}` | `scam_reports` | Preserves anti-scam / anti-illegal-fare reports for Admin review. |
| 18 | `/gratitudeNotes/{noteId}` | `gratitude_notes` | Preserves recipient family appreciation notes. |

---

## 3. Step-by-Step Controlled Cutover Runbook

### Phase A: Pre-Migration Backup (Read-Only)
Keep `DB_CUTOVER_MODE="FIRESTORE_PRIMARY"`. Export a read-only, SHA-256 checksummed snapshot of all 18 Firestore collections:
```bash
npm run db:backup-firestore
```
Output: `backups/firestore-snapshot-latest.json` (gitignored).

### Phase B: Apply Forward PostgreSQL Migrations
Using `DIRECT_DATABASE_URL`:
```bash
npm run db:migrate
```
Applies `/drizzle/0000_0000_bloodsearch_neon_core.sql` creating all 24 tables, foreign keys, indexes, and `CHECK` constraints.

### Phase C: Execute Atomic Idempotent Migration
Set `DB_CUTOVER_MODE="MIGRATION_READ_VERIFY"` and run:
```bash
npm run db:migrate-firestore
```
- Verifies the snapshot's SHA-256 checksum before reading.
- Runs inside a single PostgreSQL `BEGIN ... COMMIT` transaction (`migrateFirestoreSnapshotToNeon`). If any constraint or FK fails, the entire transaction rolls back cleanly with zero partial rows.
- Uses `ON CONFLICT DO UPDATE / DO NOTHING` so re-running is 100% idempotent.

### Phase D: Verify Record Counts, Relationships & Firebase UIDs
```bash
npm run db:verify-migration
```
`scripts/verify-neon-migration.ts` verifies:
1. Destination row counts across all mapped Neon tables are `>=` source Firestore collection counts.
2. `missingFirebaseUids.length === 0` (100% of Firebase Auth UIDs exist in `users.uid`).
3. Private donor phone numbers are isolated in `private_contacts`.

**Hard Gate**: Do **not** switch production traffic if `npm run db:verify-migration` exits non-zero.

### Phase E: Production Cutover
1. Take an immediate Neon post-migration baseline backup:
   ```bash
   npm run db:backup
   ```
2. Update backend environment variable:
   ```env
   DB_CUTOVER_MODE="NEON_PRIMARY"
   ```
3. Restart Express server and verify `GET /api/v1/db/health`.

---

## 4. Rollback Procedure

If an anomaly is detected during migration rehearsal or post-cutover:
1. Immediately revert `DB_CUTOVER_MODE="FIRESTORE_PRIMARY"` in server environment secrets and restart Express (Firestore collections were never deleted and remain intact).
2. Export a forensic Neon backup (`npm run db:backup`).
3. If rolling back schema changes on an isolated Neon branch, execute `/drizzle/rollback_0000_drop_all.sql` via `psql "$DIRECT_DATABASE_URL" -f drizzle/rollback_0000_drop_all.sql` or restore the Neon branch to its pre-migration Point-in-Time timestamp.
