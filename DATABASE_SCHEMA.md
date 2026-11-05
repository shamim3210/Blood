# BloodSearch — Neon PostgreSQL Database Schema Specification

Schema source of truth: `/src/db/schema.ts`  
Generated SQL DDL: `/drizzle/0000_0000_bloodsearch_neon_core.sql`  
Rollback SQL: `/drizzle/rollback_0000_drop_all.sql`

---

## 1. Complete Table Inventory (24 Tables)

### A. 17 Mandatory Core Operational Tables

| # | Table Name | Primary Key | Foreign Keys | Key Constraints & Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `users` | `uid VARCHAR(128)` (Firebase Auth UID) | — | `uq_users_email_lower`, `idx_users_district_status`, `chk_users_blood_group`, `chk_users_account_status` | Master identity record preserving exact Firebase Authentication UIDs. |
| 2 | `donor_profiles` | `id UUID` | `user_uid -> users.uid (CASCADE)` | `uq_donor_profiles_user_uid`, `uq_donor_profiles_smart_id`, `idx_donor_search_bg_dist_avail`, `idx_donor_geo_lat_lng`, `chk_donor_age_range (18..65)`, `chk_donor_blood_group` | Public-safe donor directory. **Contains zero raw phone numbers**; `age` is nullable and strictly manual. |
| 3 | `private_contacts` | `user_uid VARCHAR(128)` | `user_uid -> users.uid (CASCADE)` | `idx_private_contacts_visibility`, `chk_private_contact_visibility` | Isolated donor PII vault (`phone_e164`, `whatsapp_number`, `exact_street_address`). Never joined in public search queries. |
| 4 | `blood_requests` | `id UUID` | `requester_uid -> users.uid (RESTRICT)`, `hospital_id -> hospitals.id (SET NULL)`, `resolved_by_uid -> users.uid` | `idx_requests_status_bg_district`, `idx_requests_requester_created`, `idx_requests_geo`, `chk_request_status`, `chk_request_bags_range (1..20)` | Emergency SOS & scheduled transfusion requests with escalation tier (`0..4`) and masked contact phone protection. |
| 5 | `request_responses` | `id UUID` | `request_id -> blood_requests.id (CASCADE)`, `donor_uid -> users.uid (CASCADE)` | `uq_request_donor_response (request_id, donor_uid)`, `idx_responses_request_status`, `chk_response_status` | Donor commitments (`ACCEPTED`, `EN_ROUTE`, `ARRIVED`, `DONATED`, `DECLINED`) per blood request. |
| 6 | `donations` | `id UUID` | `donor_uid -> users.uid (RESTRICT)`, `request_id -> blood_requests.id`, `hospital_id -> hospitals.id`, `verified_by_uid -> users.uid` | `uq_donations_certificate_code`, `idx_donations_donor_date`, `chk_donations_units (1..4)` | Verified completed blood donations, certificate codes, and 90-day medical recovery `cooldown_until` enforcement. |
| 7 | `hospitals` | `id UUID` | — | `uq_hospitals_slug`, `idx_hospitals_district`, `idx_hospitals_geo`, `chk_hospitals_type` | Verified 64-district Bangladesh hospitals and trauma centers. |
| 8 | `blood_banks` | `id UUID` | `hospital_id -> hospitals.id (SET NULL)` | `uq_blood_banks_code`, `idx_blood_banks_district` | Licensed blood banks and 24-hour transfusion centers. |
| 9 | `blood_inventory` | `id UUID` | `blood_bank_id -> blood_banks.id (CASCADE)`, `updated_by_uid -> users.uid` | `uq_inventory_bank_group_comp`, `idx_inventory_group_status`, `chk_inventory_units_non_negative (>= 0)` | Real-time per-bank, per-blood-group, per-component (`WHOLE_BLOOD`, `PLATELETS`, `PLASMA`, `PACKED_RBC`) unit inventory. |
| 10 | `notifications` | `id UUID` | `recipient_uid -> users.uid (CASCADE)`, `related_request_id -> blood_requests.id` | `idx_notifications_recipient_unread` | Persistent in-app notification inbox for SOS matches, contact approvals, and security alerts. |
| 11 | `device_tokens` | `id UUID` | `user_uid -> users.uid (CASCADE)` | `uq_device_tokens_fcm`, `idx_device_tokens_user_active`, `chk_device_platform` | Firebase Cloud Messaging (FCM) device registration tokens (`WEB_PWA`, `ANDROID_APK`, `IOS_WEB`). |
| 12 | `admin_roles` | `id UUID` | `user_uid -> users.uid (CASCADE)`, `granted_by_uid -> users.uid`, `revoked_by_uid -> users.uid` | `uq_admin_roles_user_uid`, `idx_admin_roles_active_role`, `chk_admin_role_type` | Authoritative server-side RBAC registry (`SUPER_ADMIN`, `CO_ADMIN`, `MODERATOR`). |
| 13 | `verification_records` | `id UUID` | `subject_uid -> users.uid (CASCADE)`, `related_request_id -> blood_requests.id`, `reviewed_by_uid -> users.uid` | `uq_verification_proof_hash`, `idx_verification_subject_type`, `chk_verification_status` | Donor identity verification, hospital requisition slip checks, and single-use Co-Admin invite lock proofs. |
| 14 | `audit_logs` | `id SERIAL` | — (Immutable even if user deleted) | `idx_audit_logs_actor_created`, `idx_audit_logs_action_outcome`, `idx_audit_logs_target`, `chk_audit_outcome` | Append-only security & clinical audit trail (`UNMASK_PHONE_GRANTED`, `SOS_REQUEST_CREATED`, `ADMIN_ROLE_GRANTED`, etc.). |
| 15 | `emergency_alerts` | `id UUID` | `request_id -> blood_requests.id (CASCADE)`, `target_donor_uid -> users.uid (CASCADE)` | `idx_emergency_alerts_request_state`, `idx_emergency_alerts_donor_state`, `chk_emergency_alert_state` | Per-donor emergency dispatch lifecycle (`DISPATCHED` -> `STOPPED_RESOLVED` atomically on request fulfillment/cancellation). |
| 16 | `user_consents` | `id UUID` | `user_uid -> users.uid (CASCADE)`, `counterparty_uid -> users.uid`, `related_request_id -> blood_requests.id` | `idx_user_consents_owner_type`, `idx_user_consents_counterparty`, `chk_user_consent_status` | Auditable donor consent ledger for medical eligibility declarations and time-boxed 24-hour seeker contact approvals. |
| 17 | `login_sessions` | `id UUID` | `user_uid -> users.uid (CASCADE)` | `uq_login_sessions_token_hash`, `idx_login_sessions_user_active` | Hashed session audit records distinguishing public user sessions (`24h`) from `/admin` console sessions (`4h`). |

---

### B. 7 Lossless Firestore Parity Tables

To guarantee 100% lossless migration of all 18 existing Firestore collections without discarding community or live-tracking features:

| # | Table Name | Source Firestore Collection | Key Foreign Keys |
| :--- | :--- | :--- | :--- |
| 18 | `live_donor_trips` | `/liveDonorTrips/{tripId}` | `request_id -> blood_requests.id`, `donor_uid -> users.uid`, `requester_uid -> users.uid` |
| 19 | `community_messages` | `/communityMessages/{messageId}` | `sender_uid -> users.uid` |
| 20 | `direct_chat_rooms` | `/directChats/{chatId}` | `participant_one_uid -> users.uid`, `participant_two_uid -> users.uid` |
| 21 | `direct_chat_messages` | `/directChats/{chatId}/messages/{messageId}` | `room_id -> direct_chat_rooms.id`, `sender_uid -> users.uid` |
| 22 | `announcements` | `/announcements/{announcementId}` | `author_uid -> users.uid` |
| 23 | `scam_reports` | `/scamReports/{reportId}` | `reporter_uid -> users.uid`, `accused_uid -> users.uid`, `reviewed_by_uid -> users.uid` |
| 24 | `gratitude_notes` | `/gratitudeNotes/{noteId}` | `author_uid -> users.uid`, `honored_donor_uid -> users.uid` |

---

## 2. Entity Relationship Summary

- `users (1) ──── (0..1) donor_profiles` (Public searchable attributes; zero raw phone numbers)
- `users (1) ──── (0..1) private_contacts` (Restricted PII vault)
- `users (1) ──── (0..1) admin_roles` (Server-verified RBAC)
- `users (1) ──── (0..N) blood_requests` (`ON DELETE RESTRICT` preserves clinical request history)
- `blood_requests (1) ──── (0..N) request_responses` (`ON DELETE CASCADE`)
- `blood_requests (1) ──── (0..N) emergency_alerts` (`ON DELETE CASCADE`)
- `blood_requests (1) ──── (0..N) donations` (`ON DELETE SET NULL` so donor donation history is never lost)
- `hospitals (1) ──── (0..N) blood_banks (1) ──── (0..N) blood_inventory`

---

## 3. Privacy & Data Integrity Invariants Enforced by PostgreSQL

1. **Blood Group Domain Check**: All blood group columns enforce `IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`.
2. **Manual Donor Age Constraint**: `donor_profiles.age` has no default value and enforces `age IS NULL OR (age >= 18 AND age <= 65)` — preventing underage registration and ensuring the system never invents an automatic age.
3. **Coordinate Bounds Check**: `latitude` (`-90..90`) and `longitude` (`-180..180`) are validated both in TypeScript and via PostgreSQL `CHECK` constraints.
4. **Non-Negative Stock Check**: `blood_inventory` enforces `units_available >= 0 AND units_reserved >= 0 AND critical_threshold >= 0`.
5. **Append-Only Audit Trail**: `/drizzle/least_privilege_roles.sql` revokes `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_logs` from the `bloodsearch_app` runtime database role.
