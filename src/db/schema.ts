import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * BLOODSEARCH — HARDENED NEON POSTGRESQL PRIMARY APPLICATION SCHEMA (Drizzle ORM)
 *
 * Neon PostgreSQL is the ONLY primary application database.
 * Zero Firebase Auth / Firestore dependencies.
 *
 * Includes all 28 hardened relational tables:
 *   1. users
 *   2. auth_identities
 *   3. oidc_nonces
 *   4. login_sessions
 *   5. rate_limit_buckets
 *   6. donor_profiles
 *   7. private_contacts
 *   8. hospitals
 *   9. blood_banks
 *  10. blood_inventory
 *  11. blood_requests
 *  12. request_responses
 *  13. donations
 *  14. emergency_alerts
 *  15. notifications
 *  16. device_tokens
 *  17. admin_roles
 *  18. verification_records
 *  19. user_consents
 *  20. contact_requests
 *  21. audit_logs
 *  22. live_donor_trips
 *  23. community_messages
 *  24. direct_chat_rooms
 *  25. direct_messages
 *  26. reports
 *  27. announcements
 *  28. gratitude_notes
 */

// ============================================================================
// 1. USERS (Core user identity & account status)
// ============================================================================
export const users = pgTable(
  'users',
  {
    uid: varchar('uid', { length: 128 }).primaryKey(),
    email: varchar('email', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    phoneHint: varchar('phone_hint', { length: 32 }),
    displayName: varchar('display_name', { length: 140 }).notNull(),
    photoUrl: text('photo_url'),
    bloodGroup: varchar('blood_group', { length: 5 }),
    district: varchar('district', { length: 80 }),
    area: varchar('area', { length: 160 }),
    accountStatus: varchar('account_status', { length: 24 }).notNull().default('ACTIVE'), // ACTIVE | SUSPENDED | DELETED
    authProvider: varchar('auth_provider', { length: 40 }).notNull().default('GOOGLE_OIDC'),
    preferredLanguage: varchar('preferred_language', { length: 8 }).notNull().default('bn'),
    familyCircleJson: jsonb('family_circle_json').$type<unknown[]>().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_users_email_lower').on(table.email),
    index('idx_users_district_status').on(table.district, table.accountStatus),
    check(
      'chk_users_blood_group',
      sql`${table.bloodGroup} IS NULL OR ${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    ),
    check('chk_users_account_status', sql`${table.accountStatus} IN ('ACTIVE', 'SUSPENDED', 'DELETED')`),
  ]
);

// ============================================================================
// 2. AUTH_IDENTITIES (Google OIDC, Salted Scrypt Email/Password, & Phone OTP)
// ============================================================================
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(), // GOOGLE_OIDC | EMAIL_PASSWORD | PHONE_OTP
    providerSubject: varchar('provider_subject', { length: 255 }).notNull(), // Google `sub`, normalized email, or E.164 phone hash/number
    email: varchar('email', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    passwordHash: text('password_hash'), // Only set for EMAIL_PASSWORD (scrypt$N$r$p$salt$derivedKey)
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordResetTokenHash: varchar('password_reset_token_hash', { length: 128 }),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_auth_identities_provider_sub').on(table.provider, table.providerSubject),
    index('idx_auth_identities_user_uid').on(table.userUid),
    index('idx_auth_identities_reset_hash').on(table.passwordResetTokenHash),
    check('chk_auth_provider_type', sql`${table.provider} IN ('GOOGLE_OIDC', 'EMAIL_PASSWORD', 'PHONE_OTP')`),
    check('chk_auth_failed_non_negative', sql`${table.failedLoginCount} >= 0`),
  ]
);

// ============================================================================
// 3. OIDC_NONCES (Single-use Google OIDC Nonce & OAuth State Replay Protection)
// ============================================================================
export const oidcNonces = pgTable(
  'oidc_nonces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    nonceHash: varchar('nonce_hash', { length: 128 }).notNull(),
    stateHash: varchar('state_hash', { length: 128 }),
    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    redirectOrigin: varchar('redirect_origin', { length: 255 }),
    isConsumed: boolean('is_consumed').notNull().default(false),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_oidc_nonces_hash').on(table.nonceHash),
    index('idx_oidc_nonces_state').on(table.stateHash, table.isConsumed),
    index('idx_oidc_nonces_expires').on(table.expiresAt),
  ]
);

// ============================================================================
// 4. LOGIN_SESSIONS (Opaque Session Tokens Hashed via SHA-256 + CSRF Binding)
// ============================================================================
export const loginSessions = pgTable(
  'login_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    sessionTokenHash: varchar('session_token_hash', { length: 128 }).notNull(), // SHA-256 of random 256-bit opaque token
    csrfTokenHash: varchar('csrf_token_hash', { length: 128 }).notNull(), // SHA-256 of session-bound CSRF token
    authMethod: varchar('auth_method', { length: 32 }).notNull(), // GOOGLE_OIDC | EMAIL_PASSWORD | PHONE_OTP
    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    userAgentSummary: varchar('user_agent_summary', { length: 255 }),
    isAdminConsole: boolean('is_admin_console').notNull().default(false),
    isRevoked: boolean('is_revoked').notNull().default(false),
    revokedReason: varchar('revoked_reason', { length: 120 }),
    rotatedFromSessionId: uuid('rotated_from_session_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_login_sessions_token_hash').on(table.sessionTokenHash),
    index('idx_login_sessions_user_active').on(table.userUid, table.isRevoked, table.expiresAt),
  ]
);

// ============================================================================
// 5. RATE_LIMIT_BUCKETS (Distributed Multi-Instance PostgreSQL Rate Limiter)
// ============================================================================
export const rateLimitBuckets = pgTable(
  'rate_limit_buckets',
  {
    bucketKey: varchar('bucket_key', { length: 180 }).primaryKey(),
    hitCount: integer('hit_count').notNull().default(1),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  },
  (table) => [
    index('idx_rate_limit_expires').on(table.expiresAt),
    check('chk_rate_limit_hits', sql`${table.hitCount} >= 0`),
  ]
);

// ============================================================================
// 6. DONOR_PROFILES (Public-safe searchable donor directory — ZERO phone numbers)
// ============================================================================
export const donorProfiles = pgTable(
  'donor_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    donorSmartId: varchar('donor_smart_id', { length: 40 }).notNull(),
    publicName: varchar('public_name', { length: 140 }).notNull(),
    avatarUrl: text('avatar_url'),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    age: integer('age'), // Strictly manual user-entered (18..65)
    gender: varchar('gender', { length: 20 }), // MALE | FEMALE | OTHER
    weightKg: integer('weight_kg'),
    district: varchar('district', { length: 80 }).notNull(),
    upazila: varchar('upazila', { length: 100 }),
    area: varchar('area', { length: 180 }).notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    availabilityStatus: varchar('availability_status', { length: 24 }).notNull().default('AVAILABLE'), // AVAILABLE | BUSY | OFFLINE | COOLDOWN
    isAvailable: boolean('is_available').notNull().default(true),
    lastDonationDate: timestamp('last_donation_date', { withTimezone: true }),
    nextEligibleDate: timestamp('next_eligible_date', { withTimezone: true }),
    totalDonations: integer('total_donations').notNull().default(0),
    isVerified: boolean('is_verified').notNull().default(false),
    medicalDeclarationAccepted: boolean('medical_declaration_accepted').notNull().default(false),
    shareDirectContact: boolean('share_direct_contact').notNull().default(false),
    contactPreference: varchar('contact_preference', { length: 24 }).notNull().default('IN_APP_ONLY'), // CALL_ALLOWED | WHATSAPP_ONLY | IN_APP_ONLY | DND
    maskedPhoneHint: varchar('masked_phone_hint', { length: 32 }), // e.g., "+88017****89" (never raw phone)
    hasWhatsapp: boolean('has_whatsapp').notNull().default(false),
    hasFacebook: boolean('has_facebook').notNull().default(false),
    rating: doublePrecision('rating').notNull().default(5.0),
    responseRatePercent: integer('response_rate_percent').notNull().default(100),
    avgResponseMinutes: integer('avg_response_minutes').notNull().default(10),
    bio: text('bio'),
    lastAvailabilityConfirmedAt: timestamp('last_availability_confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_donor_profiles_user_uid').on(table.userUid),
    uniqueIndex('uq_donor_profiles_smart_id').on(table.donorSmartId),
    index('idx_donor_search_bg_dist_avail').on(table.bloodGroup, table.district, table.isAvailable),
    index('idx_donor_geo_lat_lng').on(table.latitude, table.longitude),
    index('idx_donor_verified_donations').on(table.isVerified, table.totalDonations),
    check(
      'chk_donor_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    ),
    check('chk_donor_age_range', sql`${table.age} IS NULL OR (${table.age} >= 18 AND ${table.age} <= 65)`),
    check(
      'chk_donor_lat_range',
      sql`${table.latitude} IS NULL OR (${table.latitude} >= -90 AND ${table.latitude} <= 90)`
    ),
    check(
      'chk_donor_lng_range',
      sql`${table.longitude} IS NULL OR (${table.longitude} >= -180 AND ${table.longitude} <= 180)`
    ),
    check(
      'chk_donor_availability_status',
      sql`${table.availabilityStatus} IN ('AVAILABLE', 'BUSY', 'OFFLINE', 'COOLDOWN')`
    ),
    check(
      'chk_donor_contact_preference',
      sql`${table.contactPreference} IN ('CALL_ALLOWED', 'WHATSAPP_ONLY', 'IN_APP_ONLY', 'DND')`
    ),
    check('chk_donor_total_donations', sql`${table.totalDonations} >= 0`),
  ]
);

// ============================================================================
// 7. PRIVATE_CONTACTS (Isolated donor PII vault — NEVER joined in public searches)
// ============================================================================
export const privateContacts = pgTable(
  'private_contacts',
  {
    userUid: varchar('user_uid', { length: 128 })
      .primaryKey()
      .references(() => users.uid, { onDelete: 'cascade' }),
    phoneE164: varchar('phone_e164', { length: 24 }).notNull(),
    whatsappNumber: varchar('whatsapp_number', { length: 24 }),
    alternatePhone: varchar('alternate_phone', { length: 24 }),
    facebookProfileUrl: text('facebook_profile_url'),
    emergencyContactName: varchar('emergency_contact_name', { length: 140 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 24 }),
    exactStreetAddress: text('exact_street_address'),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    contactVisibility: varchar('contact_visibility', { length: 28 }).notNull().default('REQUEST_ONLY'), // PUBLIC_OPT_IN | REQUEST_ONLY | EMERGENCY_VERIFIED_ONLY | DND_PRIVATE
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_private_contacts_visibility').on(table.contactVisibility),
    check(
      'chk_private_contact_visibility',
      sql`${table.contactVisibility} IN ('PUBLIC_OPT_IN', 'REQUEST_ONLY', 'EMERGENCY_VERIFIED_ONLY', 'DND_PRIVATE')`
    ),
  ]
);

// ============================================================================
// 8. HOSPITALS (Verified 64-district Bangladesh hospitals & trauma centers)
// ============================================================================
export const hospitals = pgTable(
  'hospitals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 140 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    nameBn: varchar('name_bn', { length: 200 }),
    district: varchar('district', { length: 80 }).notNull(),
    upazila: varchar('upazila', { length: 100 }),
    address: text('address').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    emergencyPhone: varchar('emergency_phone', { length: 32 }),
    bloodBankPhone: varchar('blood_bank_phone', { length: 32 }),
    hospitalType: varchar('hospital_type', { length: 32 }).notNull().default('GOVERNMENT'), // GOVERNMENT | PRIVATE | MEDICAL_COLLEGE | SPECIALIZED | NON_PROFIT
    hasBloodBank: boolean('has_blood_bank').notNull().default(true),
    isVerified: boolean('is_verified').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_hospitals_slug').on(table.slug),
    index('idx_hospitals_district').on(table.district, table.isVerified),
    index('idx_hospitals_geo').on(table.latitude, table.longitude),
    check(
      'chk_hospitals_type',
      sql`${table.hospitalType} IN ('GOVERNMENT', 'PRIVATE', 'MEDICAL_COLLEGE', 'SPECIALIZED', 'NON_PROFIT')`
    ),
  ]
);

// ============================================================================
// 9. BLOOD_BANKS (Licensed blood banks & transfusion centers)
// ============================================================================
export const bloodBanks = pgTable(
  'blood_banks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    hospitalId: uuid('hospital_id').references(() => hospitals.id, { onDelete: 'set null' }),
    district: varchar('district', { length: 80 }).notNull(),
    address: text('address').notNull(),
    contactPhone: varchar('contact_phone', { length: 32 }).notNull(),
    licenseNumber: varchar('license_number', { length: 80 }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    is24Hours: boolean('is_24_hours').notNull().default(true),
    isVerified: boolean('is_verified').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_blood_banks_code').on(table.code),
    index('idx_blood_banks_district').on(table.district, table.isVerified),
  ]
);

// ============================================================================
// 10. BLOOD_INVENTORY (Per-bank, per-blood-group stock tracking)
// ============================================================================
export const bloodInventory = pgTable(
  'blood_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bloodBankId: uuid('blood_bank_id')
      .notNull()
      .references(() => bloodBanks.id, { onDelete: 'cascade' }),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    componentType: varchar('component_type', { length: 32 }).notNull().default('WHOLE_BLOOD'), // WHOLE_BLOOD | PACKED_RBC | PLATELETS | PLASMA
    unitsAvailable: integer('units_available').notNull().default(0),
    unitsReserved: integer('units_reserved').notNull().default(0),
    criticalThreshold: integer('critical_threshold').notNull().default(5),
    stockStatus: varchar('stock_status', { length: 20 }).notNull().default('ADEQUATE'), // ADEQUATE | LOW | CRITICAL | OUT_OF_STOCK
    updatedByUid: varchar('updated_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_inventory_bank_group_comp').on(table.bloodBankId, table.bloodGroup, table.componentType),
    index('idx_inventory_group_status').on(table.bloodGroup, table.stockStatus),
    check(
      'chk_inventory_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    ),
    check(
      'chk_inventory_units_non_negative',
      sql`${table.unitsAvailable} >= 0 AND ${table.unitsReserved} >= 0 AND ${table.criticalThreshold} >= 0`
    ),
    check(
      'chk_inventory_stock_status',
      sql`${table.stockStatus} IN ('ADEQUATE', 'LOW', 'CRITICAL', 'OUT_OF_STOCK')`
    ),
  ]
);

// ============================================================================
// 11. BLOOD_REQUESTS (Emergency SOS & scheduled transfusion requests)
// ============================================================================
export const bloodRequests = pgTable(
  'blood_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterUid: varchar('requester_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'restrict' }),
    targetDonorUid: varchar('target_donor_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    patientName: varchar('patient_name', { length: 160 }).notNull(),
    patientAge: integer('patient_age'),
    patientGender: varchar('patient_gender', { length: 20 }),
    hemoglobin: doublePrecision('hemoglobin'),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    bagsNeeded: integer('bags_needed').notNull().default(1),
    bagsFulfilled: integer('bags_fulfilled').notNull().default(0),
    isPlateletRequest: boolean('is_platelet_request').notNull().default(false),
    urgency: varchar('urgency', { length: 20 }).notNull().default('URGENT'), // CRITICAL | URGENT | STANDARD
    requiredWindow: varchar('required_window', { length: 32 }).default('IMMEDIATE'),
    status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE | FULFILLED | CANCELLED | EXPIRED
    hospitalId: uuid('hospital_id').references(() => hospitals.id, { onDelete: 'set null' }),
    hospitalName: varchar('hospital_name', { length: 220 }).notNull(),
    district: varchar('district', { length: 80 }).notNull(),
    area: varchar('area', { length: 180 }).notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    neededAt: timestamp('needed_at', { withTimezone: true }),
    clinicalReason: text('clinical_reason'),
    requisitionSlipVerified: boolean('requisition_slip_verified').notNull().default(false),
    hospitalSlipDataUrl: text('hospital_slip_data_url'),
    contactName: varchar('contact_name', { length: 140 }),
    contactPhonePrivate: varchar('contact_phone_private', { length: 28 }), // Masked in API unless authorized
    shareDirectContact: boolean('share_direct_contact').notNull().default(false),
    escalationLevel: integer('escalation_level').notNull().default(0),
    SearchRadiusKm: integer('search_radius_km').notNull().default(5),
    respondersCount: integer('responders_count').notNull().default(0),
    resolvedByUid: varchar('resolved_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionReason: varchar('resolution_reason', { length: 160 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_requests_status_bg_district').on(table.status, table.bloodGroup, table.district),
    index('idx_requests_requester_created').on(table.requesterUid, table.createdAt),
    index('idx_requests_geo').on(table.latitude, table.longitude),
    index('idx_requests_expires').on(table.status, table.expiresAt),
    check(
      'chk_request_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    ),
    check('chk_request_urgency', sql`${table.urgency} IN ('CRITICAL', 'URGENT', 'STANDARD')`),
    check('chk_request_status', sql`${table.status} IN ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED')`),
    check(
      'chk_request_bags_range',
      sql`${table.bagsNeeded} >= 1 AND ${table.bagsNeeded} <= 20 AND ${table.bagsFulfilled} >= 0`
    ),
    check('chk_request_escalation_range', sql`${table.escalationLevel} >= 0 AND ${table.escalationLevel} <= 4`),
  ]
);

// ============================================================================
// 12. REQUEST_RESPONSES (Donor commitments & en-route status per blood request)
// ============================================================================
export const requestResponses = pgTable(
  'request_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    donorUid: varchar('donor_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    donorName: varchar('donor_name', { length: 140 }).notNull(),
    donorBloodGroup: varchar('donor_blood_group', { length: 5 }).notNull(),
    responseStatus: varchar('response_status', { length: 28 }).notNull().default('ACCEPTED'), // ACCEPTED | EN_ROUTE | ARRIVED | DONATED | DECLINED | CANCELLED
    etaMinutes: integer('eta_minutes'),
    note: text('note'),
    donorLatitude: doublePrecision('donor_latitude'),
    donorLongitude: doublePrecision('donor_longitude'),
    respondedAt: timestamp('responded_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_request_donor_response').on(table.requestId, table.donorUid),
    index('idx_responses_request_status').on(table.requestId, table.responseStatus),
    check(
      'chk_response_status',
      sql`${table.responseStatus} IN ('ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DONATED', 'DECLINED', 'CANCELLED')`
    ),
  ]
);

// ============================================================================
// 13. DONATIONS (Verified completed blood donation records & cooldown enforcement)
// ============================================================================
export const donations = pgTable(
  'donations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    donorUid: varchar('donor_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'restrict' }),
    requestId: uuid('request_id').references(() => bloodRequests.id, { onDelete: 'set null' }),
    hospitalId: uuid('hospital_id').references(() => hospitals.id, { onDelete: 'set null' }),
    hospitalName: varchar('hospital_name', { length: 200 }).notNull(),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    unitsDonated: integer('units_donated').notNull().default(1),
    donatedAt: timestamp('donated_at', { withTimezone: true }).notNull().defaultNow(),
    cooldownUntil: timestamp('cooldown_until', { withTimezone: true }).notNull(),
    verifiedByUid: varchar('verified_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    certificateCode: varchar('certificate_code', { length: 64 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_donations_certificate_code').on(table.certificateCode),
    index('idx_donations_donor_date').on(table.donorUid, table.donatedAt),
    index('idx_donations_request').on(table.requestId),
    check(
      'chk_donations_blood_group',
      sql`${table.bloodGroup} IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')`
    ),
    check('chk_donations_units', sql`${table.unitsDonated} >= 1 AND ${table.unitsDonated} <= 4`),
  ]
);

// ============================================================================
// 14. EMERGENCY_ALERTS (Targeted SOS dispatch lifecycle, retry & instant stop-alert)
// ============================================================================
export const emergencyAlerts = pgTable(
  'emergency_alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    targetDonorUid: varchar('target_donor_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'cascade',
    }),
    escalationLevel: integer('escalation_level').notNull().default(0),
    radiusKm: integer('radius_km').notNull().default(5),
    channel: varchar('channel', { length: 24 }).notNull().default('IN_APP'), // IN_APP | WEB_PUSH | SMS_FALLBACK
    alertState: varchar('alert_state', { length: 28 }).notNull().default('DISPATCHED'), // DISPATCHED | DELIVERED | FAILED_RETRYABLE | ACKNOWLEDGED | STOPPED_RESOLVED | EXPIRED
    retryCount: integer('retry_count').notNull().default(0),
    lastError: varchar('last_error', { length: 255 }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_emergency_alerts_request_state').on(table.requestId, table.alertState),
    index('idx_emergency_alerts_donor_state').on(table.targetDonorUid, table.alertState),
    check(
      'chk_emergency_alert_channel',
      sql`${table.channel} IN ('IN_APP', 'WEB_PUSH', 'SMS_FALLBACK')`
    ),
    check(
      'chk_emergency_alert_state',
      sql`${table.alertState} IN ('DISPATCHED', 'DELIVERED', 'FAILED_RETRYABLE', 'ACKNOWLEDGED', 'STOPPED_RESOLVED', 'EXPIRED')`
    ),
    check('chk_emergency_alert_retries', sql`${table.retryCount} >= 0`),
  ]
);

// ============================================================================
// 15. NOTIFICATIONS (User notification inbox + retryable delivery tracking)
// ============================================================================
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientUid: varchar('recipient_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    notificationType: varchar('notification_type', { length: 40 }).notNull(), // SOS_MATCH | CONTACT_REQUEST | CONTACT_APPROVED | REQUEST_RESOLVED | SYSTEM_SECURITY
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    relatedRequestId: uuid('related_request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    deliveryStatus: varchar('delivery_status', { length: 24 }).notNull().default('DELIVERED'), // DELIVERED | FAILED_RETRYABLE | RETRIED_DELIVERED
    retryCount: integer('retry_count').notNull().default(0),
    lastError: varchar('last_error', { length: 255 }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_recipient_unread').on(table.recipientUid, table.isRead, table.createdAt),
    index('idx_notifications_delivery_retry').on(table.deliveryStatus, table.retryCount),
    check(
      'chk_notifications_delivery_status',
      sql`${table.deliveryStatus} IN ('DELIVERED', 'FAILED_RETRYABLE', 'RETRIED_DELIVERED')`
    ),
  ]
);

// ============================================================================
// 16. DEVICE_TOKENS (W3C Web Push & Native Push Tokens per authenticated device)
// ============================================================================
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    pushToken: text('push_token').notNull(),
    platform: varchar('platform', { length: 24 }).notNull().default('WEB_PWA'), // WEB_PWA | ANDROID_APK | IOS_WEB
    deviceLabel: varchar('device_label', { length: 140 }),
    isActive: boolean('is_active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_device_tokens_push').on(table.pushToken),
    index('idx_device_tokens_user_active').on(table.userUid, table.isActive),
    check('chk_device_platform', sql`${table.platform} IN ('WEB_PWA', 'ANDROID_APK', 'IOS_WEB')`),
  ]
);

// ============================================================================
// 17. ADMIN_ROLES (Strict DB-backed RBAC — Super Admin & Co-Admin registry)
// ============================================================================
export const adminRoles = pgTable(
  'admin_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 24 }).notNull(), // SUPER_ADMIN | CO_ADMIN | MODERATOR
    permissionsJson: jsonb('permissions_json').$type<string[]>().default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    grantedByUid: varchar('granted_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    revokedByUid: varchar('revoked_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_admin_roles_user_uid').on(table.userUid),
    index('idx_admin_roles_active_role').on(table.isActive, table.role),
    check('chk_admin_role_type', sql`${table.role} IN ('SUPER_ADMIN', 'CO_ADMIN', 'MODERATOR')`),
  ]
);

// ============================================================================
// 18. VERIFICATION_RECORDS (Donor KYC, Hospital Slips, & Admin Vault Invite Locks)
// ============================================================================
export const verificationRecords = pgTable(
  'verification_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectUid: varchar('subject_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'cascade',
    }),
    relatedRequestId: uuid('related_request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    verificationType: varchar('verification_type', { length: 40 }).notNull(), // DONOR_IDENTITY | HOSPITAL_SLIP | PHONE_OTP | ADMIN_INVITE_LOCK | SCAM_INVESTIGATION
    status: varchar('status', { length: 24 }).notNull().default('PENDING'), // PENDING | APPROVED | REJECTED | EXPIRED | CONSUMED
    proofHash: varchar('proof_hash', { length: 128 }),
    evidenceSummary: text('evidence_summary'),
    reviewedByUid: varchar('reviewed_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_verification_proof_hash').on(table.proofHash),
    index('idx_verification_subject_type').on(table.subjectUid, table.verificationType, table.status),
    check(
      'chk_verification_status',
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED')`
    ),
  ]
);

// ============================================================================
// 19. USER_CONSENTS (GDPR/BD Data Protection — Contact Reveal & Medical Terms)
// ============================================================================
export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userUid: varchar('user_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    counterpartyUid: varchar('counterparty_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'cascade',
    }),
    relatedRequestId: uuid('related_request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    consentType: varchar('consent_type', { length: 40 }).notNull(), // DIRECT_CONTACT_OPT_IN | SEEKER_CONTACT_REQUEST | MEDICAL_ELIGIBILITY | PRIVACY_POLICY
    status: varchar('status', { length: 24 }).notNull().default('GRANTED'), // PENDING | GRANTED | DENIED | REVOKED | EXPIRED
    policyVersion: varchar('policy_version', { length: 24 }).notNull().default('3.0.0'),
    reason: text('reason'),
    grantedAt: timestamp('granted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_consents_owner_type').on(table.userUid, table.consentType, table.status),
    index('idx_user_consents_counterparty').on(table.counterpartyUid, table.userUid, table.status),
    check(
      'chk_user_consent_status',
      sql`${table.status} IN ('PENDING', 'GRANTED', 'DENIED', 'REVOKED', 'EXPIRED')`
    ),
  ]
);

// ============================================================================
// 20. CONTACT_REQUESTS (Dedicated Seeker -> Donor Contact Consent Workflow)
// ============================================================================
export const contactRequests = pgTable(
  'contact_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterUid: varchar('requester_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    requesterName: varchar('requester_name', { length: 140 }).notNull(),
    donorUid: varchar('donor_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    donorName: varchar('donor_name', { length: 140 }).notNull(),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    relatedRequestId: uuid('related_request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    channelRequested: varchar('channel_requested', { length: 24 }).notNull().default('ALL'), // CALL | SMS | WHATSAPP | FACEBOOK | ALL
    reason: text('reason').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('PENDING'), // PENDING | APPROVED | DENIED | REVOKED | EXPIRED
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_contact_requests_donor_status').on(table.donorUid, table.status, table.createdAt),
    index('idx_contact_requests_requester_donor').on(table.requesterUid, table.donorUid, table.status),
    check(
      'chk_contact_requests_status',
      sql`${table.status} IN ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED')`
    ),
    check(
      'chk_contact_requests_channel',
      sql`${table.channelRequested} IN ('CALL', 'SMS', 'WHATSAPP', 'FACEBOOK', 'ALL')`
    ),
  ]
);

// ============================================================================
// 21. AUDIT_LOGS (Immutable security & clinical action trail — zero raw secrets)
// ============================================================================
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorUid: varchar('actor_uid', { length: 128 }), // Nullable for unauthenticated blocked attempts
    actorRole: varchar('actor_role', { length: 28 }).notNull().default('USER'),
    action: varchar('action', { length: 64 }).notNull(),
    targetEntityType: varchar('target_entity_type', { length: 48 }).notNull(),
    targetEntityId: varchar('target_entity_id', { length: 128 }).notNull(),
    outcome: varchar('outcome', { length: 20 }).notNull().default('SUCCESS'), // SUCCESS | DENIED | ERROR
    ipHash: varchar('ip_hash', { length: 64 }),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_logs_actor_created').on(table.actorUid, table.createdAt),
    index('idx_audit_logs_action_outcome').on(table.action, table.outcome, table.createdAt),
    index('idx_audit_logs_target').on(table.targetEntityType, table.targetEntityId),
    check('chk_audit_outcome', sql`${table.outcome} IN ('SUCCESS', 'DENIED', 'ERROR')`),
  ]
);

// ============================================================================
// 22. LIVE_DONOR_TRIPS (Real-time donor GPS en-route telemetry)
// ============================================================================
export const liveDonorTrips = pgTable(
  'live_donor_trips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => bloodRequests.id, { onDelete: 'cascade' }),
    donorUid: varchar('donor_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    requesterUid: varchar('requester_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    donorName: varchar('donor_name', { length: 140 }).notNull(),
    bloodGroup: varchar('blood_group', { length: 5 }).notNull(),
    currentLat: doublePrecision('current_lat').notNull(),
    currentLng: doublePrecision('current_lng').notNull(),
    hospitalLat: doublePrecision('hospital_lat'),
    hospitalLng: doublePrecision('hospital_lng'),
    etaMinutes: integer('eta_minutes'),
    distanceKm: doublePrecision('distance_km'),
    tripStatus: varchar('trip_status', { length: 24 }).notNull().default('EN_ROUTE'), // EN_ROUTE | ARRIVED | COMPLETED | STOPPED
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_live_trips_request_status').on(table.requestId, table.tripStatus),
    index('idx_live_trips_donor_status').on(table.donorUid, table.tripStatus),
    check('chk_live_trips_status', sql`${table.tripStatus} IN ('EN_ROUTE', 'ARRIVED', 'COMPLETED', 'STOPPED')`),
  ]
);

// ============================================================================
// 23. COMMUNITY_MESSAGES (District/national donor community chat)
// ============================================================================
export const communityMessages = pgTable(
  'community_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    senderUid: varchar('sender_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    senderName: varchar('sender_name', { length: 140 }).notNull(),
    senderAvatar: text('sender_avatar'),
    senderRole: varchar('sender_role', { length: 32 }).default('DONOR'),
    isVerifiedDonor: boolean('is_verified_donor').notNull().default(false),
    senderBloodGroup: varchar('sender_blood_group', { length: 5 }),
    district: varchar('district', { length: 80 }),
    messageText: text('message_text').notNull(),
    attachmentType: varchar('attachment_type', { length: 24 }), // NONE | GPS_PIN | SLIP_PHOTO | SOS_CARD
    attachmentJson: jsonb('attachment_json').$type<Record<string, unknown>>(),
    replyToId: varchar('reply_to_id', { length: 80 }),
    replyToName: varchar('reply_to_name', { length: 140 }),
    replyToText: text('reply_to_text'),
    reactionsJson: jsonb('reactions_json').$type<Record<string, string[]>>().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_community_msg_created').on(table.createdAt),
    index('idx_community_msg_district').on(table.district, table.createdAt),
  ]
);

// ============================================================================
// 24. DIRECT_CHAT_ROOMS (Private 1-to-1 participant-restricted chat rooms)
// ============================================================================
export const directChatRooms = pgTable(
  'direct_chat_rooms',
  {
    id: varchar('id', { length: 160 }).primaryKey(), // Deterministic sorted uidA_uidB room key
    participantOneUid: varchar('participant_one_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    participantTwoUid: varchar('participant_two_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    participantNamesJson: jsonb('participant_names_json').$type<Record<string, string>>().default(sql`'{}'::jsonb`),
    participantAvatarsJson: jsonb('participant_avatars_json').$type<Record<string, string>>().default(sql`'{}'::jsonb`),
    participantBloodGroupsJson: jsonb('participant_blood_groups_json').$type<Record<string, string>>().default(sql`'{}'::jsonb`),
    relatedRequestId: uuid('related_request_id').references(() => bloodRequests.id, {
      onDelete: 'set null',
    }),
    hospitalName: varchar('hospital_name', { length: 200 }),
    lastMessagePreview: text('last_message_preview'),
    lastSenderUid: varchar('last_sender_uid', { length: 128 }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_direct_chat_p1').on(table.participantOneUid, table.lastMessageAt),
    index('idx_direct_chat_p2').on(table.participantTwoUid, table.lastMessageAt),
  ]
);

// ============================================================================
// 25. DIRECT_MESSAGES (Private 1-to-1 encrypted-in-transit chat messages)
// ============================================================================
export const directMessages = pgTable(
  'direct_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: varchar('room_id', { length: 160 })
      .notNull()
      .references(() => directChatRooms.id, { onDelete: 'cascade' }),
    senderUid: varchar('sender_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    senderName: varchar('sender_name', { length: 140 }),
    senderBloodGroup: varchar('sender_blood_group', { length: 5 }),
    messageText: text('message_text').notNull(),
    attachmentType: varchar('attachment_type', { length: 24 }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_direct_msg_room_created').on(table.roomId, table.createdAt),
  ]
);

export const directChatMessages = directMessages;

// ============================================================================
// 26. REPORTS (Scam, illegal money demand, & abuse moderation queue)
// ============================================================================
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterUid: varchar('reporter_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    reporterName: varchar('reporter_name', { length: 140 }),
    accusedUid: varchar('accused_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    accusedName: varchar('accused_name', { length: 140 }),
    accusedPhoneHash: varchar('accused_phone_hash', { length: 64 }),
    category: varchar('category', { length: 48 }).notNull().default('ILLEGAL_MONEY_DEMAND'),
    description: text('description').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('OPEN'), // OPEN | UNDER_REVIEW | ACTION_TAKEN | DISMISSED
    resolutionNote: text('resolution_note'),
    reviewedByUid: varchar('reviewed_by_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_reports_status_created').on(table.status, table.createdAt),
    check('chk_reports_status', sql`${table.status} IN ('OPEN', 'UNDER_REVIEW', 'ACTION_TAKEN', 'DISMISSED')`),
  ]
);

export const scamReports = reports;

// ============================================================================
// 27. ANNOUNCEMENTS (Admin broadcasts & OTA APK release notifications)
// ============================================================================
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    announcementType: varchar('announcement_type', { length: 24 }).notNull().default('BROADCAST'), // BROADCAST | OTA_APP_UPDATE
    title: varchar('title', { length: 220 }).notNull(),
    body: text('body').notNull(),
    priority: varchar('priority', { length: 20 }).notNull().default('INFO'), // INFO | WARNING | CRITICAL
    targetVersion: varchar('target_version', { length: 32 }),
    apkDownloadUrl: text('apk_download_url'),
    forceUpdate: boolean('force_update').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    authorUid: varchar('author_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_announcements_active_type_created').on(table.isActive, table.announcementType, table.createdAt),
    check('chk_announcements_priority', sql`${table.priority} IN ('INFO', 'WARNING', 'CRITICAL')`),
    check('chk_announcements_type', sql`${table.announcementType} IN ('BROADCAST', 'OTA_APP_UPDATE')`),
  ]
);

// ============================================================================
// 28. GRATITUDE_NOTES (Patient-to-donor public wall of gratitude)
// ============================================================================
export const gratitudeNotes = pgTable(
  'gratitude_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorUid: varchar('author_uid', { length: 128 })
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    authorName: varchar('author_name', { length: 140 }).notNull(),
    honoredDonorUid: varchar('honored_donor_uid', { length: 128 }).references(() => users.uid, {
      onDelete: 'set null',
    }),
    honoredDonorName: varchar('honored_donor_name', { length: 140 }),
    bloodGroup: varchar('blood_group', { length: 5 }),
    district: varchar('district', { length: 80 }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_gratitude_notes_created').on(table.createdAt),
  ]
);

// ============================================================================
// DRIZZLE ORM EXPLICIT RELATIONAL GRAPH
// ============================================================================
export const usersRelations = relations(users, ({ one, many }) => ({
  authIdentities: many(authIdentities),
  donorProfile: one(donorProfiles, {
    fields: [users.uid],
    references: [donorProfiles.userUid],
  }),
  privateContact: one(privateContacts, {
    fields: [users.uid],
    references: [privateContacts.userUid],
  }),
  adminRole: one(adminRoles, {
    fields: [users.uid],
    references: [adminRoles.userUid],
  }),
  bloodRequests: many(bloodRequests),
  requestResponses: many(requestResponses),
  donations: many(donations),
  notifications: many(notifications),
  deviceTokens: many(deviceTokens),
  consents: many(userConsents),
  loginSessions: many(loginSessions),
}));

export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, {
    fields: [authIdentities.userUid],
    references: [users.uid],
  }),
}));

export const donorProfilesRelations = relations(donorProfiles, ({ one }) => ({
  user: one(users, {
    fields: [donorProfiles.userUid],
    references: [users.uid],
  }),
}));

export const privateContactsRelations = relations(privateContacts, ({ one }) => ({
  user: one(users, {
    fields: [privateContacts.userUid],
    references: [users.uid],
  }),
}));

export const hospitalsRelations = relations(hospitals, ({ many }) => ({
  bloodBanks: many(bloodBanks),
  bloodRequests: many(bloodRequests),
  donations: many(donations),
}));

export const bloodBanksRelations = relations(bloodBanks, ({ one, many }) => ({
  hospital: one(hospitals, {
    fields: [bloodBanks.hospitalId],
    references: [hospitals.id],
  }),
  inventoryItems: many(bloodInventory),
}));

export const bloodInventoryRelations = relations(bloodInventory, ({ one }) => ({
  bloodBank: one(bloodBanks, {
    fields: [bloodInventory.bloodBankId],
    references: [bloodBanks.id],
  }),
}));

export const bloodRequestsRelations = relations(bloodRequests, ({ one, many }) => ({
  requester: one(users, {
    fields: [bloodRequests.requesterUid],
    references: [users.uid],
  }),
  hospital: one(hospitals, {
    fields: [bloodRequests.hospitalId],
    references: [hospitals.id],
  }),
  responses: many(requestResponses),
  emergencyAlerts: many(emergencyAlerts),
  donations: many(donations),
}));

export const requestResponsesRelations = relations(requestResponses, ({ one }) => ({
  request: one(bloodRequests, {
    fields: [requestResponses.requestId],
    references: [bloodRequests.id],
  }),
  donor: one(users, {
    fields: [requestResponses.donorUid],
    references: [users.uid],
  }),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  donor: one(users, {
    fields: [donations.donorUid],
    references: [users.uid],
  }),
  request: one(bloodRequests, {
    fields: [donations.requestId],
    references: [bloodRequests.id],
  }),
  hospital: one(hospitals, {
    fields: [donations.hospitalId],
    references: [hospitals.id],
  }),
}));

export const CORE_REQUIRED_TABLES = [
  'users',
  'auth_identities',
  'oidc_nonces',
  'login_sessions',
  'rate_limit_buckets',
  'donor_profiles',
  'private_contacts',
  'blood_requests',
  'request_responses',
  'donations',
  'hospitals',
  'blood_banks',
  'blood_inventory',
  'notifications',
  'device_tokens',
  'admin_roles',
  'verification_records',
  'audit_logs',
  'emergency_alerts',
  'user_consents',
  'contact_requests',
] as const;

export const COLLABORATION_TABLES = [
  'live_donor_trips',
  'community_messages',
  'direct_chat_rooms',
  'direct_messages',
  'reports',
  'announcements',
  'gratitude_notes',
] as const;

export const PARITY_TABLES = COLLABORATION_TABLES;

export const ALL_BLOODSEARCH_TABLES = [...CORE_REQUIRED_TABLES, ...COLLABORATION_TABLES] as const;
