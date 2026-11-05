import crypto from 'node:crypto';
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { BloodSearchDatabase } from '../index';
import { checkPostgisAvailability } from '../neonMonitor';
import {
  adminRoles,
  announcements,
  auditLogs,
  authIdentities,
  bloodBanks,
  bloodInventory,
  bloodRequests,
  communityMessages,
  contactRequests,
  deviceTokens,
  directChatRooms,
  directMessages,
  donations,
  donorProfiles,
  emergencyAlerts,
  gratitudeNotes,
  hospitals,
  liveDonorTrips,
  loginSessions,
  notifications,
  privateContacts,
  reports,
  requestResponses,
  userConsents,
  users,
  verificationRecords,
} from '../schema';

export type ServerActorRole = 'SUPER_ADMIN' | 'CO_ADMIN' | 'MODERATOR' | 'USER';

export interface AuthenticatedActor {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  photoUrl?: string | null;
  ipHash: string;
}

export interface ResolvedActor extends AuthenticatedActor {
  role: ServerActorRole;
}

export class DomainSecurityError extends Error {
  public readonly httpStatus: number;
  public readonly code: string;

  constructor(httpStatus: number, code: string, message: string) {
    super(message);
    this.name = 'DomainSecurityError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/**
 * Optional server-side bootstrap identity. This value is read only from the
 * deployment secret store; it is never exposed to Vite/client bundles. Actual
 * Super Admin access still requires a verified identity and an active
 * SUPER_ADMIN row in `admin_roles`.
 */
export function isSuperOwnerIdentityEmail(normalizedEmail: string): boolean {
  const configured = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  return Boolean(configured && normalizedEmail && normalizedEmail === configured);
}

const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const VALID_URGENCIES = new Set(['CRITICAL', 'URGENT', 'STANDARD']);
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);
const TERMINAL_REQUEST_STATES = new Set(['FULFILLED', 'CANCELLED', 'EXPIRED']);

const COMPATIBLE_DONOR_GROUPS_FOR_RECIPIENT: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

const ESCALATION_RADIUS_BY_LEVEL: Record<number, number> = {
  0: 5,
  1: 15,
  2: 40,
  3: 85,
  4: 500,
};

export function hashIdentifier(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function maskBangladeshPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 7) return '***';
  return `${cleaned.slice(0, 6)}****${cleaned.slice(-2)}`;
}

export function normalizeBangladeshPhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (/^\+8801[3-9]\d{8}$/.test(digits)) return digits;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
  throw new DomainSecurityError(
    400,
    'INVALID_BD_PHONE',
    'Phone number must be a valid Bangladesh mobile number (+8801[3-9]XXXXXXXX).'
  );
}

function assertCleanText(value: unknown, fieldName: string, maxLen = 180, minLen = 1): string {
  const str = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  if (str.length < minLen || str.length > maxLen) {
    throw new DomainSecurityError(
      400,
      'VALIDATION_ERROR',
      `Invalid ${fieldName}: must be between ${minLen} and ${maxLen} characters.`
    );
  }
  return str;
}

export function sanitizeOutputText(raw: string | null | undefined, maxLen = 2000): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .slice(0, maxLen);
}

export function validateSafeImageDataUrl(raw: unknown, maxBytes = 350_000): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('https://')) {
    try {
      const u = new URL(s);
      if (u.protocol === 'https:' && !u.username && !u.password && s.length <= 1024) {
        return s;
      }
    } catch {
      throw new DomainSecurityError(400, 'INVALID_IMAGE_URL', 'Invalid HTTPS image URL.');
    }
  }
  // Strictly allow only raster image data URLs (PNG, JPEG, WEBP) — explicitly block SVG/HTML/JS!
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(s);
  if (!match) {
    throw new DomainSecurityError(
      400,
      'UNSAFE_FILE_TYPE',
      'Only PNG, JPEG, or WEBP raster images are permitted. SVG, HTML, and executable files are blocked.'
    );
  }
  const approxBytes = Math.floor((match[2]!.length * 3) / 4);
  if (approxBytes > maxBytes) {
    throw new DomainSecurityError(
      413,
      'FILE_TOO_LARGE',
      `Uploaded image exceeds maximum allowed size (${Math.round(maxBytes / 1024)} KB).`
    );
  }
  // Verify magic bytes of decoded buffer
  const head = Buffer.from(match[2]!.slice(0, 32), 'base64');
  const isPng = head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp =
    head.length >= 12 &&
    head.subarray(0, 4).toString('ascii') === 'RIFF' &&
    head.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) {
    throw new DomainSecurityError(
      400,
      'INVALID_IMAGE_SIGNATURE',
      'Uploaded file binary header does not match a valid PNG, JPEG, or WEBP image.'
    );
  }
  return s;
}

function assertBloodGroup(value: unknown): string {
  const bg = String(value ?? '').trim().toUpperCase();
  if (!VALID_BLOOD_GROUPS.has(bg)) {
    throw new DomainSecurityError(400, 'INVALID_BLOOD_GROUP', 'Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-.');
  }
  return bg;
}

function assertOptionalCoordinates(latRaw: unknown, lngRaw: unknown): { lat: number | null; lng: number | null } {
  if (latRaw === undefined || latRaw === null || latRaw === '' || lngRaw === undefined || lngRaw === null || lngRaw === '') {
    return { lat: null, lng: null };
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new DomainSecurityError(400, 'INVALID_COORDINATES', 'Latitude (-90..90) and Longitude (-180..180) must be valid numbers.');
  }
  return { lat, lng };
}

/**
 * Resolves the caller's authoritative role strictly from verified session/OIDC identity + PostgreSQL `admin_roles`.
 * NEVER trusts any role or admin flag sent by the frontend or APK request payload.
 */
export async function resolveActorRole(
  db: BloodSearchDatabase,
  actor: AuthenticatedActor
): Promise<ResolvedActor> {
  const normalizedEmail = (actor.email || '').trim().toLowerCase();

  const [roleRow] = await db
    .select()
    .from(adminRoles)
    .where(and(eq(adminRoles.userUid, actor.uid), eq(adminRoles.isActive, true)))
    .limit(1);

  if (roleRow && actor.emailVerified) {
    if (roleRow.role === 'SUPER_ADMIN' && isSuperOwnerIdentityEmail(normalizedEmail)) {
      return { ...actor, role: 'SUPER_ADMIN' };
    }
    if (roleRow.role === 'CO_ADMIN') {
      return { ...actor, role: 'CO_ADMIN' };
    }
    if (roleRow.role === 'MODERATOR') {
      return { ...actor, role: 'MODERATOR' };
    }
  }

  return { ...actor, role: 'USER' };
}

export function isAdminRole(role: ServerActorRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'CO_ADMIN';
}

export async function writeAuditLog(
  dbOrTx: Pick<BloodSearchDatabase, 'insert'>,
  entry: {
    actorUid: string | null;
    actorRole: ServerActorRole | 'ANONYMOUS';
    action: string;
    targetEntityType: string;
    targetEntityId: string;
    outcome: 'SUCCESS' | 'DENIED' | 'ERROR';
    ipHash?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await dbOrTx.insert(auditLogs).values({
    actorUid: entry.actorUid,
    actorRole: entry.actorRole,
    action: entry.action,
    targetEntityType: entry.targetEntityType,
    targetEntityId: entry.targetEntityId,
    outcome: entry.outcome,
    ipHash: entry.ipHash || null,
    detailsJson: entry.details || {},
  });
}

async function ensureActorUserRowTx(
  tx: Pick<BloodSearchDatabase, 'insert'>,
  actor: ResolvedActor
): Promise<void> {
  await tx
    .insert(users)
    .values({
      uid: actor.uid,
      email: actor.email || null,
      emailVerified: actor.emailVerified,
      displayName:
        actor.displayName ||
        (actor.email ? actor.email.split('@')[0] || 'BloodSearch User' : 'BloodSearch User'),
      photoUrl: actor.photoUrl || null,
    })
    .onConflictDoNothing({ target: users.uid });
}

// ============================================================================
// 1. TRANSACTIONAL USER + DONOR PROFILE + PRIVATE CONTACT REGISTRATION / UPDATE
// ============================================================================
export interface UpsertDonorRegistrationInput {
  targetUid: string;
  displayName: string;
  avatarUrl?: string | null;
  bloodGroup: string;
  age?: number | null;
  gender?: string | null;
  weightKg?: number | null;
  district: string;
  upazila?: string | null;
  area: string;
  latitude?: number | null;
  longitude?: number | null;
  phone: string;
  whatsappNumber?: string | null;
  facebookProfileUrl?: string | null;
  exactStreetAddress?: string | null;
  isAvailable?: boolean;
  availabilityStatus?: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'COOLDOWN' | 'DND' | 'TEMPORARILY_UNAVAILABLE';
  dndUntil?: string | Date | null;
  lastDonationDate?: string | Date | null;
  totalDonations?: number;
  shareDirectContact?: boolean;
  contactPreference?: 'CALL_ALLOWED' | 'WHATSAPP_ONLY' | 'IN_APP_ONLY' | 'DND';
  contactVisibility?: 'PUBLIC_OPT_IN' | 'REQUEST_ONLY' | 'EMERGENCY_VERIFIED_ONLY' | 'DND_PRIVATE';
  medicalDeclarationAccepted: boolean;
  bio?: string | null;
}

export async function upsertUserAndDonorProfileTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  input: UpsertDonorRegistrationInput
) {
  if (actor.uid !== input.targetUid && !isAdminRole(actor.role)) {
    await writeAuditLog(db, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'IDOR_DONOR_PROFILE_UPDATE_BLOCKED',
      targetEntityType: 'donor_profiles',
      targetEntityId: input.targetUid,
      outcome: 'DENIED',
      ipHash: actor.ipHash,
    });
    throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'You may only create or modify your own donor profile.');
  }

  const publicName = assertCleanText(input.displayName, 'displayName', 140, 2);
  const safeAvatar = validateSafeImageDataUrl(input.avatarUrl, 250_000);
  const bloodGroup = assertBloodGroup(input.bloodGroup);
  const district = assertCleanText(input.district, 'district', 80, 2);
  const area = assertCleanText(input.area, 'area', 180, 2);
  const phoneE164 = normalizeBangladeshPhone(input.phone);
  const whatsappE164 = input.whatsappNumber ? normalizeBangladeshPhone(input.whatsappNumber) : phoneE164;
  const { lat, lng } = assertOptionalCoordinates(input.latitude, input.longitude);

  let validatedAge: number | null = null;
  if (input.age !== undefined && input.age !== null && String(input.age) !== '') {
    const parsedAge = Number(input.age);
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 65) {
      throw new DomainSecurityError(400, 'INVALID_DONOR_AGE', 'Donor age must be an integer between 18 and 65.');
    }
    validatedAge = parsedAge;
  }

  let validatedGender: string | null = null;
  if (input.gender) {
    const g = String(input.gender).trim().toUpperCase();
    if (!VALID_GENDERS.has(g)) {
      throw new DomainSecurityError(400, 'INVALID_GENDER', 'Gender must be MALE, FEMALE, or OTHER.');
    }
    validatedGender = g;
  }

  if (!input.medicalDeclarationAccepted) {
    throw new DomainSecurityError(400, 'MEDICAL_CONSENT_REQUIRED', 'Donor medical eligibility declaration must be accepted.');
  }

  const shareDirect = input.contactPreference === 'DND' ? false : Boolean(input.shareDirectContact);
  const contactPref = input.contactPreference || (shareDirect ? 'CALL_ALLOWED' : 'IN_APP_ONLY');
  const visibility =
    contactPref === 'DND'
      ? 'DND_PRIVATE'
      : input.contactVisibility || (shareDirect ? 'PUBLIC_OPT_IN' : 'REQUEST_ONLY');

  const sanitizeDbFacebookUrl = (raw?: string | null): string | null => {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s || /[<>"'\u0000\r\n]|javascript:|vbscript:|data:/i.test(s)) return null;
    if (/^(https?:\/\/)?(www\.|m\.|web\.|mbasic\.)?(facebook\.com|fb\.com|fb\.me)\/.+/i.test(s)) {
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      else s = s.replace(/^http:\/\//i, 'https://');
      try {
        const u = new URL(s);
        if (u.username || u.password) return null;
        if (!/^(www\.|m\.|web\.|mbasic\.)?(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname)) {
          return null;
        }
        const clean = `https://${u.hostname.toLowerCase()}${u.pathname}${u.search}`.replace(/\/+$/, '');
        return clean.length >= 12 && clean.length <= 200 ? clean : null;
      } catch {
        return null;
      }
    }
    const handle = s.replace(/^@+/, '').replace(/^\/+|\/+$/g, '');
    if (/^[a-zA-Z0-9._-]{3,80}$/.test(handle) && !handle.includes('..')) {
      return `https://facebook.com/${handle}`;
    }
    return null;
  };

  const safeFacebookUrl = sanitizeDbFacebookUrl(input.facebookProfileUrl);
  const smartId = `BS-${district.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'B')}-${hashIdentifier(input.targetUid).slice(0, 8).toUpperCase()}`;

  let parsedLastDon: Date | null = null;
  let parsedNextEligible: Date | null = null;
  if (input.lastDonationDate) {
    const dt = new Date(input.lastDonationDate);
    if (!Number.isNaN(dt.getTime())) {
      parsedLastDon = dt;
      parsedNextEligible = new Date(dt.getTime() + 90 * 24 * 60 * 60 * 1000);
    }
  }

  const availStatus: 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'COOLDOWN' =
    input.availabilityStatus === 'AVAILABLE' ||
    input.availabilityStatus === 'BUSY' ||
    input.availabilityStatus === 'OFFLINE' ||
    input.availabilityStatus === 'COOLDOWN'
      ? input.availabilityStatus
      : input.availabilityStatus === 'DND' ||
          input.availabilityStatus === 'TEMPORARILY_UNAVAILABLE' ||
          input.isAvailable === false
        ? 'OFFLINE'
        : 'AVAILABLE';

  return db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .insert(users)
      .values({
        uid: input.targetUid,
        email: actor.uid === input.targetUid ? actor.email : null,
        emailVerified: actor.uid === input.targetUid ? actor.emailVerified : false,
        displayName: publicName,
        photoUrl: safeAvatar || undefined,
        bloodGroup,
        district,
        area,
        phoneHint: maskBangladeshPhone(phoneE164),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          displayName: publicName,
          ...(safeAvatar ? { photoUrl: safeAvatar } : {}),
          bloodGroup,
          district,
          area,
          phoneHint: maskBangladeshPhone(phoneE164),
          email: actor.uid === input.targetUid && actor.email ? actor.email : sql`${users.email}`,
          emailVerified: actor.uid === input.targetUid ? actor.emailVerified : sql`${users.emailVerified}`,
          updatedAt: now,
        },
      });

    const [profile] = await tx
      .insert(donorProfiles)
      .values({
        userUid: input.targetUid,
        donorSmartId: smartId,
        publicName,
        avatarUrl: safeAvatar,
        bloodGroup,
        age: validatedAge,
        gender: validatedGender,
        weightKg: input.weightKg ?? null,
        district,
        upazila: input.upazila ? assertCleanText(input.upazila, 'upazila', 100, 1) : null,
        area,
        latitude: lat,
        longitude: lng,
        availabilityStatus: availStatus,
        isAvailable: availStatus === 'AVAILABLE',
        lastDonationDate: parsedLastDon,
        nextEligibleDate: parsedNextEligible,
        totalDonations: Math.max(0, Number(input.totalDonations || 0)),
        medicalDeclarationAccepted: true,
        shareDirectContact: shareDirect,
        contactPreference: contactPref,
        maskedPhoneHint: maskBangladeshPhone(phoneE164),
        hasWhatsapp: Boolean(whatsappE164),
        hasFacebook: Boolean(safeFacebookUrl),
        bio: input.bio ? assertCleanText(input.bio, 'bio', 500, 1) : null,
        lastAvailabilityConfirmedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: donorProfiles.userUid,
        set: {
          publicName,
          ...(safeAvatar ? { avatarUrl: safeAvatar } : {}),
          bloodGroup,
          age: validatedAge,
          gender: validatedGender,
          weightKg: input.weightKg ?? null,
          district,
          upazila: input.upazila ? assertCleanText(input.upazila, 'upazila', 100, 1) : null,
          area,
          latitude: lat,
          longitude: lng,
          availabilityStatus: availStatus,
          isAvailable: availStatus === 'AVAILABLE',
          ...(parsedLastDon ? { lastDonationDate: parsedLastDon, nextEligibleDate: parsedNextEligible } : {}),
          ...(input.totalDonations !== undefined ? { totalDonations: Math.max(0, Number(input.totalDonations || 0)) } : {}),
          medicalDeclarationAccepted: true,
          shareDirectContact: shareDirect,
          contactPreference: contactPref,
          maskedPhoneHint: maskBangladeshPhone(phoneE164),
          hasWhatsapp: Boolean(whatsappE164),
          hasFacebook: Boolean(safeFacebookUrl),
          bio: input.bio ? assertCleanText(input.bio, 'bio', 500, 1) : null,
          lastAvailabilityConfirmedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    const safeStreetAddress = input.exactStreetAddress
      ? assertCleanText(input.exactStreetAddress, 'exactStreetAddress', 400, 1)
      : null;

    await tx
      .insert(privateContacts)
      .values({
        userUid: input.targetUid,
        phoneE164,
        whatsappNumber: whatsappE164,
        facebookProfileUrl: safeFacebookUrl,
        exactStreetAddress: safeStreetAddress,
        contactVisibility: visibility,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: privateContacts.userUid,
        set: {
          phoneE164,
          whatsappNumber: whatsappE164,
          facebookProfileUrl: safeFacebookUrl,
          exactStreetAddress: safeStreetAddress,
          contactVisibility: visibility,
          updatedAt: now,
        },
      });

    await tx.insert(userConsents).values({
      userUid: input.targetUid,
      consentType: 'MEDICAL_ELIGIBILITY',
      status: 'GRANTED',
      policyVersion: '3.0.0',
      grantedAt: now,
      reason: `shareDirect=${shareDirect};visibility=${visibility}`,
    });

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'DONOR_PROFILE_UPSERTED',
      targetEntityType: 'donor_profiles',
      targetEntityId: profile!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        targetUid: input.targetUid,
        bloodGroup,
        district,
        visibility,
      },
    });

    return profile!;
  });
}

// ============================================================================
// 2. PAGINATED & GEOSPATIAL PUBLIC DONOR SEARCH (ZERO RAW PII EXPOSURE)
// ============================================================================
export interface DonorSearchQuery {
  bloodGroup?: string;
  includeCompatible?: boolean;
  district?: string;
  areaQuery?: string;
  availableOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

export async function searchPublicDonorsPaginated(db: BloodSearchDatabase, query: DonorSearchQuery) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (query.bloodGroup && query.bloodGroup.trim().toUpperCase() !== 'ALL') {
    const bg = assertBloodGroup(query.bloodGroup);
    if (query.includeCompatible) {
      const compatList = COMPATIBLE_DONOR_GROUPS_FOR_RECIPIENT[bg] || [bg];
      conditions.push(inArray(donorProfiles.bloodGroup, compatList));
    } else {
      conditions.push(eq(donorProfiles.bloodGroup, bg));
    }
  }

  if (query.district && query.district.trim().toUpperCase() !== 'ALL') {
    const cleanDistrict = assertCleanText(query.district, 'district', 80, 1);
    conditions.push(sql`LOWER(${donorProfiles.district}) = LOWER(${cleanDistrict})`);
  }

  if (query.areaQuery && query.areaQuery.trim().length > 0) {
    const cleanQ = assertCleanText(query.areaQuery, 'areaQuery', 100, 1).replace(/[%_\\]/g, '');
    if (cleanQ.length > 0) {
      const pattern = `%${cleanQ}%`;
      conditions.push(
        or(
          sql`${donorProfiles.area} ILIKE ${pattern}`,
          sql`${donorProfiles.publicName} ILIKE ${pattern}`,
          sql`COALESCE(${donorProfiles.upazila}, '') ILIKE ${pattern}`
        )!
      );
    }
  }

  if (query.availableOnly !== false) {
    conditions.push(eq(donorProfiles.isAvailable, true));
  }

  const hasGeoCenter =
    query.latitude !== undefined &&
    query.longitude !== undefined &&
    Number.isFinite(Number(query.latitude)) &&
    Number.isFinite(Number(query.longitude));

  let geoStrategy: 'NONE' | 'POSTGIS_GEOGRAPHY' | 'INDEXED_BOUNDING_BOX_HAVERSINE' = 'NONE';
  let distanceExpr = sql<number | null>`NULL`;

  if (hasGeoCenter) {
    const { lat, lng } = assertOptionalCoordinates(query.latitude, query.longitude);
    const radiusKm = Math.min(500, Math.max(1, Number(query.radiusKm) || 25));

    if (lat !== null && lng !== null) {
      const latDelta = radiusKm / 110.574;
      const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      const lngDelta = radiusKm / (111.32 * cosLat);

      conditions.push(isNotNull(donorProfiles.latitude));
      conditions.push(isNotNull(donorProfiles.longitude));
      conditions.push(between(donorProfiles.latitude, lat - latDelta, lat + latDelta));
      conditions.push(between(donorProfiles.longitude, lng - lngDelta, lng + lngDelta));

      const postgis = await checkPostgisAvailability(db);
      if (postgis.installed) {
        geoStrategy = 'POSTGIS_GEOGRAPHY';
        const radiusMeters = radiusKm * 1000;
        conditions.push(
          sql`ST_DWithin(
            ST_SetSRID(ST_MakePoint(${donorProfiles.longitude}, ${donorProfiles.latitude}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )`
        );
        distanceExpr = sql<number>`ROUND((
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${donorProfiles.longitude}, ${donorProfiles.latitude}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) / 1000.0
        )::numeric, 2)::double precision`;
      } else {
        geoStrategy = 'INDEXED_BOUNDING_BOX_HAVERSINE';
        const rawHaversine = sql`(
          6371.0 * 2.0 * ASIN(
            SQRT(
              LEAST(
                1.0,
                POWER(SIN(RADIANS((${donorProfiles.latitude} - ${lat}) / 2.0)), 2) +
                COS(RADIANS(${lat})) * COS(RADIANS(${donorProfiles.latitude})) *
                POWER(SIN(RADIANS((${donorProfiles.longitude} - ${lng}) / 2.0)), 2)
              )
            )
          )
        )`;
        conditions.push(sql`${rawHaversine} <= ${radiusKm}`);
        distanceExpr = sql<number>`ROUND((${rawHaversine})::numeric, 2)::double precision`;
      }
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(donorProfiles)
    .where(whereClause);

  // Strictly select ONLY public-safe columns from donor_profiles — private_contacts is NEVER joined!
  const rows = await db
    .select({
      id: donorProfiles.id,
      userUid: donorProfiles.userUid,
      donorSmartId: donorProfiles.donorSmartId,
      publicName: donorProfiles.publicName,
      avatarUrl: donorProfiles.avatarUrl,
      bloodGroup: donorProfiles.bloodGroup,
      age: donorProfiles.age,
      gender: donorProfiles.gender,
      district: donorProfiles.district,
      upazila: donorProfiles.upazila,
      area: donorProfiles.area,
      approxLatitude: sql<number | null>`CASE WHEN ${donorProfiles.latitude} IS NULL THEN NULL ELSE ROUND(${donorProfiles.latitude}::numeric, 3)::double precision END`,
      approxLongitude: sql<number | null>`CASE WHEN ${donorProfiles.longitude} IS NULL THEN NULL ELSE ROUND(${donorProfiles.longitude}::numeric, 3)::double precision END`,
      availabilityStatus: donorProfiles.availabilityStatus,
      isAvailable: donorProfiles.isAvailable,
      lastDonationDate: donorProfiles.lastDonationDate,
      nextEligibleDate: donorProfiles.nextEligibleDate,
      totalDonations: donorProfiles.totalDonations,
      isVerified: donorProfiles.isVerified,
      shareDirectContact: donorProfiles.shareDirectContact,
      contactPreference: donorProfiles.contactPreference,
      maskedPhoneHint: donorProfiles.maskedPhoneHint,
      hasWhatsapp: donorProfiles.hasWhatsapp,
      hasFacebook: donorProfiles.hasFacebook,
      rating: donorProfiles.rating,
      responseRatePercent: donorProfiles.responseRatePercent,
      avgResponseMinutes: donorProfiles.avgResponseMinutes,
      bio: donorProfiles.bio,
      lastAvailabilityConfirmedAt: donorProfiles.lastAvailabilityConfirmedAt,
      createdAt: donorProfiles.createdAt,
      distanceKm: distanceExpr,
    })
    .from(donorProfiles)
    .where(whereClause)
    .orderBy(
      ...(hasGeoCenter ? [asc(distanceExpr)] : []),
      desc(donorProfiles.isAvailable),
      desc(donorProfiles.isVerified),
      desc(donorProfiles.rating),
      desc(donorProfiles.totalDonations)
    )
    .limit(limit)
    .offset(offset);

  const totalPages = Math.max(1, Math.ceil(Number(totalCount) / limit));

  return {
    items: rows,
    pagination: {
      page,
      limit,
      totalItems: Number(totalCount),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    geoStrategy,
  };
}

// ============================================================================
// 3. PRIVATE DONOR CONTACT VAULT ACCESS & CONSENT WORKFLOW
// ============================================================================
export async function getAuthorizedDonorPrivateContactTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  targetDonorUid: string,
  relatedRequestId?: string
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(donorProfiles)
      .where(or(eq(donorProfiles.userUid, targetDonorUid), sql`${donorProfiles.id}::text = ${targetDonorUid}`))
      .limit(1);

    const resolvedDonorUid = profile?.userUid || targetDonorUid;

    const [contact] = await tx
      .select()
      .from(privateContacts)
      .where(eq(privateContacts.userUid, resolvedDonorUid))
      .limit(1);

    if (!profile || !contact) {
      throw new DomainSecurityError(404, 'DONOR_CONTACT_NOT_FOUND', 'Donor contact record does not exist.');
    }

    const isSelf = actor.uid === resolvedDonorUid;
    const isAdmin = isAdminRole(actor.role);

    if (!isSelf && !isAdmin) {
      if (profile.contactPreference === 'DND' || contact.contactVisibility === 'DND_PRIVATE') {
        await writeAuditLog(tx, {
          actorUid: actor.uid,
          actorRole: actor.role,
          action: 'UNMASK_PHONE_BLOCKED_DND',
          targetEntityType: 'private_contacts',
          targetEntityId: resolvedDonorUid,
          outcome: 'DENIED',
          ipHash: actor.ipHash,
        });
        throw new DomainSecurityError(
          403,
          'DONOR_DND_PRIVATE',
          'This donor has enabled Do-Not-Disturb / Private Contact protection.'
        );
      }

      const isPublicOptIn = profile.shareDirectContact && contact.contactVisibility === 'PUBLIC_OPT_IN';

      if (!isPublicOptIn) {
        const now = new Date();
        const [grantedConsent] = await tx
          .select()
          .from(userConsents)
          .where(
            and(
              eq(userConsents.userUid, resolvedDonorUid),
              eq(userConsents.counterpartyUid, actor.uid),
              eq(userConsents.consentType, 'SEEKER_CONTACT_REQUEST'),
              eq(userConsents.status, 'GRANTED')
            )
          )
          .limit(1);

        const [approvedContactReq] = await tx
          .select()
          .from(contactRequests)
          .where(
            and(
              eq(contactRequests.donorUid, resolvedDonorUid),
              eq(contactRequests.requesterUid, actor.uid),
              eq(contactRequests.status, 'APPROVED')
            )
          )
          .limit(1);

        const consentValid =
          (Boolean(grantedConsent) && (!grantedConsent.expiresAt || grantedConsent.expiresAt.getTime() > now.getTime())) ||
          (Boolean(approvedContactReq) && (!approvedContactReq.expiresAt || approvedContactReq.expiresAt.getTime() > now.getTime()));

        let donorAcceptedActorsRequest = false;
        if (!consentValid && relatedRequestId) {
          const [activeReq] = await tx
            .select()
            .from(bloodRequests)
            .where(
              and(
                eq(bloodRequests.id, relatedRequestId),
                eq(bloodRequests.requesterUid, actor.uid),
                eq(bloodRequests.status, 'ACTIVE')
              )
            )
            .limit(1);
          if (activeReq) {
            const [acceptedResp] = await tx
              .select()
              .from(requestResponses)
              .where(
                and(
                  eq(requestResponses.requestId, activeReq.id),
                  eq(requestResponses.donorUid, resolvedDonorUid),
                  inArray(requestResponses.responseStatus, ['ACCEPTED', 'EN_ROUTE', 'ARRIVED'])
                )
              )
              .limit(1);
            donorAcceptedActorsRequest = Boolean(acceptedResp);
          }
        }

        if (!consentValid && !donorAcceptedActorsRequest) {
          await writeAuditLog(tx, {
            actorUid: actor.uid,
            actorRole: actor.role,
            action: 'UNMASK_PHONE_CONSENT_REQUIRED',
            targetEntityType: 'private_contacts',
            targetEntityId: resolvedDonorUid,
            outcome: 'DENIED',
            ipHash: actor.ipHash,
          });
          throw new DomainSecurityError(
            403,
            'CONSENT_REQUIRED',
            'Explicit donor consent is required before viewing private phone details. Send an in-app contact request first.'
          );
        }
      }
    }

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'UNMASK_PHONE_GRANTED',
      targetEntityType: 'private_contacts',
      targetEntityId: resolvedDonorUid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        relatedRequestId: relatedRequestId || null,
        contactPreference: profile.contactPreference,
      },
    });

    return {
      donorUid: resolvedDonorUid,
      publicName: profile.publicName,
      contactPreference: profile.contactPreference,
      phoneE164: profile.contactPreference === 'WHATSAPP_ONLY' && !isSelf && !isAdmin ? null : contact.phoneE164,
      whatsappNumber: contact.whatsappNumber,
      facebookProfileUrl: contact.facebookProfileUrl,
    };
  });
}

export async function getPublicOptedInDonorContactTx(
  db: BloodSearchDatabase,
  targetDonorUid: string,
  ipHash: string
) {
  const cleanUid = assertCleanText(targetDonorUid, 'donorUid', 128, 2);
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(donorProfiles)
      .where(or(eq(donorProfiles.userUid, cleanUid), sql`${donorProfiles.id}::text = ${cleanUid}`))
      .limit(1);

    const resolvedUid = profile?.userUid || cleanUid;

    const [contact] = await tx
      .select()
      .from(privateContacts)
      .where(eq(privateContacts.userUid, resolvedUid))
      .limit(1);

    if (!profile || !contact) {
      throw new DomainSecurityError(404, 'DONOR_CONTACT_NOT_FOUND', 'Donor contact record does not exist.');
    }

    if (
      profile.contactPreference === 'DND' ||
      contact.contactVisibility === 'DND_PRIVATE'
    ) {
      await writeAuditLog(tx, {
        actorUid: null,
        actorRole: 'ANONYMOUS',
        action: 'PUBLIC_OPTIN_CONTACT_BLOCKED_DND',
        targetEntityType: 'private_contacts',
        targetEntityId: resolvedUid,
        outcome: 'DENIED',
        ipHash,
      });
      throw new DomainSecurityError(
        403,
        'DONOR_DND_PRIVATE',
        'Donor has enabled Do-Not-Disturb protection.'
      );
    }

    if (!profile.shareDirectContact || contact.contactVisibility !== 'PUBLIC_OPT_IN') {
      await writeAuditLog(tx, {
        actorUid: null,
        actorRole: 'ANONYMOUS',
        action: 'PUBLIC_OPTIN_CONTACT_CONSENT_REQUIRED',
        targetEntityType: 'private_contacts',
        targetEntityId: resolvedUid,
        outcome: 'DENIED',
        ipHash,
      });
      throw new DomainSecurityError(
        403,
        'CONSENT_REQUIRED',
        'Donor requires authenticated consent before sharing direct contact.'
      );
    }

    await writeAuditLog(tx, {
      actorUid: null,
      actorRole: 'ANONYMOUS',
      action: 'PUBLIC_OPTIN_CONTACT_VIEWED',
      targetEntityType: 'private_contacts',
      targetEntityId: resolvedUid,
      outcome: 'SUCCESS',
      ipHash,
      details: { contactPreference: profile.contactPreference },
    });

    const allowCall = profile.contactPreference !== 'WHATSAPP_ONLY' && profile.contactPreference !== 'IN_APP_ONLY';
    const allowWhatsApp = profile.contactPreference !== 'IN_APP_ONLY';
    const allowSms = profile.contactPreference !== 'WHATSAPP_ONLY' && profile.contactPreference !== 'IN_APP_ONLY';

    return {
      donorUid: resolvedUid,
      publicName: profile.publicName,
      contactPreference: profile.contactPreference,
      phoneE164: allowCall || allowSms ? contact.phoneE164 : null,
      whatsappNumber: allowWhatsApp ? contact.whatsappNumber || contact.phoneE164 : null,
      facebookProfileUrl: contact.facebookProfileUrl,
      allowCall,
      allowWhatsApp,
      allowSms,
    };
  });
}

export async function requestDonorContactConsentTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  targetDonorUid: string,
  reason: string,
  relatedRequestId?: string,
  channelRequested: 'CALL' | 'SMS' | 'WHATSAPP' | 'FACEBOOK' | 'ALL' = 'ALL'
) {
  const cleanReason = assertCleanText(reason, 'reason', 300, 4);

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [donorProf] = await tx
      .select()
      .from(donorProfiles)
      .where(or(eq(donorProfiles.userUid, targetDonorUid), sql`${donorProfiles.id}::text = ${targetDonorUid}`))
      .limit(1);

    const resolvedDonorUid = donorProf?.userUid || targetDonorUid;
    if (actor.uid === resolvedDonorUid) {
      throw new DomainSecurityError(400, 'SELF_CONSENT_INVALID', 'Cannot request contact consent from yourself.');
    }

    const [consent] = await tx
      .insert(userConsents)
      .values({
        userUid: resolvedDonorUid,
        counterpartyUid: actor.uid,
        relatedRequestId: relatedRequestId || null,
        consentType: 'SEEKER_CONTACT_REQUEST',
        status: 'PENDING',
        reason: cleanReason,
      })
      .returning();

    await tx.insert(contactRequests).values({
      id: consent!.id,
      requesterUid: actor.uid,
      requesterName: actor.displayName || actor.email?.split('@')[0] || 'Emergency Seeker',
      donorUid: resolvedDonorUid,
      donorName: donorProf?.publicName || 'Blood Donor',
      bloodGroup: donorProf?.bloodGroup || 'O+',
      relatedRequestId: relatedRequestId || null,
      channelRequested,
      reason: cleanReason,
      status: 'PENDING',
    });

    await tx.insert(notifications).values({
      recipientUid: resolvedDonorUid,
      notificationType: 'CONTACT_REQUEST',
      title: 'জরুরি রক্তের যোগাযোগের অনুরোধ (Contact Request)',
      body: cleanReason,
      relatedRequestId: relatedRequestId || null,
      metadataJson: { consentId: consent!.id, requesterUid: actor.uid },
    });

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'CONTACT_CONSENT_REQUESTED',
      targetEntityType: 'contact_requests',
      targetEntityId: consent!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: { targetDonorUid: resolvedDonorUid, channelRequested },
    });

    return consent!;
  });
}

export async function respondDonorContactConsentTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  consentId: string,
  decision: 'GRANTED' | 'DENIED' | 'REVOKED'
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(userConsents).where(eq(userConsents.id, consentId)).limit(1);
    if (!existing) {
      throw new DomainSecurityError(404, 'CONSENT_NOT_FOUND', 'Consent request not found.');
    }

    if (existing.userUid !== actor.uid && !isAdminRole(actor.role)) {
      await writeAuditLog(tx, {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: 'IDOR_CONSENT_DECISION_BLOCKED',
        targetEntityType: 'contact_requests',
        targetEntityId: consentId,
        outcome: 'DENIED',
        ipHash: actor.ipHash,
      });
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only the target donor can approve or revoke contact consent.');
    }

    const now = new Date();
    const expiresAt = decision === 'GRANTED' ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;

    const [updated] = await tx
      .update(userConsents)
      .set({
        status: decision,
        grantedAt: decision === 'GRANTED' ? now : existing.grantedAt,
        revokedAt: decision === 'REVOKED' || decision === 'DENIED' ? now : null,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(userConsents.id, consentId))
      .returning();

    const mappedContactStatus =
      decision === 'GRANTED' ? 'APPROVED' : decision === 'DENIED' ? 'DENIED' : 'REVOKED';
    await tx
      .update(contactRequests)
      .set({
        status: mappedContactStatus,
        respondedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(contactRequests.id, consentId));

    if (existing.counterpartyUid) {
      await tx.insert(notifications).values({
        recipientUid: existing.counterpartyUid,
        notificationType: decision === 'GRANTED' ? 'CONTACT_APPROVED' : 'SYSTEM_SECURITY',
        title:
          decision === 'GRANTED'
            ? 'ডোনার যোগাযোগের অনুমতি দিয়েছেন (Contact Approved)'
            : 'যোগাযোগের অনুমতি আপডেট হয়েছে',
        body:
          decision === 'GRANTED'
            ? 'আপনি আগামী ২৪ ঘণ্টার জন্য ডোনারের ভেরিফায়েড নম্বর দেখতে পারবেন।'
            : 'ডোনার তার ব্যক্তিগত নম্বর গোপন রেখেছেন।',
        metadataJson: { consentId, decision },
      });
    }

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `CONTACT_CONSENT_${decision}`,
      targetEntityType: 'contact_requests',
      targetEntityId: consentId,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return updated!;
  });
}

export async function listContactRequestsForActor(db: BloodSearchDatabase, actor: ResolvedActor) {
  const incoming = await db
    .select()
    .from(contactRequests)
    .where(eq(contactRequests.donorUid, actor.uid))
    .orderBy(desc(contactRequests.createdAt))
    .limit(50);

  const outgoing = await db
    .select()
    .from(contactRequests)
    .where(eq(contactRequests.requesterUid, actor.uid))
    .orderBy(desc(contactRequests.createdAt))
    .limit(50);

  return { incoming, outgoing };
}

// ============================================================================
// 4. TRANSACTIONAL EMERGENCY BLOOD REQUESTS, RESPONSES, RETRY & EXPIRY
// ============================================================================
export interface CreateBloodRequestInput {
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  hemoglobin?: number | null;
  bloodGroup: string;
  bagsNeeded: number;
  isPlateletRequest?: boolean;
  urgency: 'CRITICAL' | 'URGENT' | 'STANDARD';
  requiredWindow?: string | null;
  targetDonorUid?: string | null;
  hospitalId?: string | null;
  hospitalName: string;
  district: string;
  area: string;
  latitude?: number | null;
  longitude?: number | null;
  clinicalReason?: string | null;
  requisitionSlipVerified?: boolean;
  hospitalSlipDataUrl?: string | null;
  contactName?: string | null;
  contactPhone: string;
  shareDirectContact?: boolean;
  expiresInHours?: number;
}

export async function createBloodRequestWithAlertsTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  input: CreateBloodRequestInput
) {
  const patientName = assertCleanText(input.patientName, 'patientName', 160, 2);
  const bloodGroup = assertBloodGroup(input.bloodGroup);
  const urgency = String(input.urgency || 'URGENT').trim().toUpperCase();
  if (!VALID_URGENCIES.has(urgency)) {
    throw new DomainSecurityError(400, 'INVALID_URGENCY', 'Urgency must be CRITICAL, URGENT, or STANDARD.');
  }

  const bagsNeeded = Number(input.bagsNeeded);
  if (!Number.isInteger(bagsNeeded) || bagsNeeded < 1 || bagsNeeded > 20) {
    throw new DomainSecurityError(400, 'INVALID_BAGS_NEEDED', 'Bags needed must be an integer between 1 and 20.');
  }

  const hospitalName = assertCleanText(input.hospitalName, 'hospitalName', 220, 2);
  const district = assertCleanText(input.district, 'district', 80, 2);
  const area = assertCleanText(input.area, 'area', 180, 2);
  const contactPhoneE164 = normalizeBangladeshPhone(input.contactPhone);
  const { lat, lng } = assertOptionalCoordinates(input.latitude, input.longitude);
  const safeSlipUrl = validateSafeImageDataUrl(input.hospitalSlipDataUrl, 350_000);
  const expiresHours = Math.min(168, Math.max(1, Number(input.expiresInHours || 48)));

  return db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .insert(users)
      .values({
        uid: actor.uid,
        email: actor.email,
        emailVerified: actor.emailVerified,
        displayName: input.contactName ? assertCleanText(input.contactName, 'contactName', 140, 2) : actor.displayName || 'BloodSearch User',
        district,
        area,
      })
      .onConflictDoNothing({ target: users.uid });

    const [createdRequest] = await tx
      .insert(bloodRequests)
      .values({
        requesterUid: actor.uid,
        targetDonorUid: input.targetDonorUid || null,
        patientName,
        patientAge: input.patientAge !== undefined && input.patientAge !== null ? Number(input.patientAge) : null,
        patientGender: input.patientGender ? String(input.patientGender).slice(0, 20) : null,
        hemoglobin: input.hemoglobin !== undefined && input.hemoglobin !== null ? Number(input.hemoglobin) : null,
        bloodGroup,
        bagsNeeded,
        isPlateletRequest: Boolean(input.isPlateletRequest),
        urgency,
        requiredWindow: input.requiredWindow ? String(input.requiredWindow).slice(0, 32) : 'IMMEDIATE',
        status: 'ACTIVE',
        hospitalId: input.hospitalId || null,
        hospitalName,
        district,
        area,
        latitude: lat,
        longitude: lng,
        clinicalReason: input.clinicalReason ? assertCleanText(input.clinicalReason, 'clinicalReason', 500, 1) : null,
        requisitionSlipVerified: Boolean(input.requisitionSlipVerified || safeSlipUrl),
        hospitalSlipDataUrl: safeSlipUrl,
        contactName: input.contactName ? assertCleanText(input.contactName, 'contactName', 140, 1) : null,
        contactPhonePrivate: contactPhoneE164,
        shareDirectContact: Boolean(input.shareDirectContact),
        escalationLevel: 0,
        SearchRadiusKm: 5,
        expiresAt: new Date(now.getTime() + expiresHours * 60 * 60 * 1000),
      })
      .returning();

    const compatGroups = COMPATIBLE_DONOR_GROUPS_FOR_RECIPIENT[bloodGroup] || [bloodGroup];
    const matchedDonors = await tx
      .select({ userUid: donorProfiles.userUid })
      .from(donorProfiles)
      .where(
        and(
          inArray(donorProfiles.bloodGroup, compatGroups),
          sql`LOWER(${donorProfiles.district}) = LOWER(${district})`,
          eq(donorProfiles.isAvailable, true),
          ne(donorProfiles.userUid, actor.uid)
        )
      )
      .limit(25);

    if (matchedDonors.length > 0) {
      await tx.insert(emergencyAlerts).values(
        matchedDonors.map((d) => ({
          requestId: createdRequest!.id,
          targetDonorUid: d.userUid,
          escalationLevel: 0,
          radiusKm: 5,
          channel: 'IN_APP',
          alertState: 'DISPATCHED',
        }))
      );

      await tx.insert(notifications).values(
        matchedDonors.map((d) => ({
          recipientUid: d.userUid,
          notificationType: 'SOS_MATCH',
          title: `জরুরি ${bloodGroup} রক্ত প্রয়োজন (${district})`,
          body: `${hospitalName}-এ ${bagsNeeded} ব্যাগ ${bloodGroup} রক্ত প্রয়োজন।`,
          relatedRequestId: createdRequest!.id,
          metadataJson: { urgency, bloodGroup, district },
        }))
      );
    }

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'SOS_REQUEST_CREATED',
      targetEntityType: 'blood_requests',
      targetEntityId: createdRequest!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        bloodGroup,
        urgency,
        district,
        alertsDispatched: matchedDonors.length,
      },
    });

    return {
      request: sanitizeBloodRequestForCaller(createdRequest!, actor),
      alertsDispatched: matchedDonors.length,
      notifiedDonorUids: matchedDonors.map((d) => d.userUid),
    };
  });
}

export function sanitizeBloodRequestForCaller(
  reqRow: typeof bloodRequests.$inferSelect,
  actor: ResolvedActor | null,
  responders?: Array<typeof requestResponses.$inferSelect>
) {
  const isOwner = Boolean(actor && actor.uid === reqRow.requesterUid);
  const isAdmin = Boolean(actor && isAdminRole(actor.role));
  const revealPhone = isOwner || isAdmin || (reqRow.shareDirectContact && reqRow.status === 'ACTIVE');

  return {
    id: reqRow.id,
    requesterUid: reqRow.requesterUid,
    targetDonorUid: reqRow.targetDonorUid,
    patientName: reqRow.patientName,
    patientAge: reqRow.patientAge,
    patientGender: reqRow.patientGender,
    hemoglobin: reqRow.hemoglobin,
    bloodGroup: reqRow.bloodGroup,
    bagsNeeded: reqRow.bagsNeeded,
    bagsFulfilled: reqRow.bagsFulfilled,
    isPlateletRequest: reqRow.isPlateletRequest,
    urgency: reqRow.urgency,
    requiredWindow: reqRow.requiredWindow,
    status: reqRow.status,
    hospitalId: reqRow.hospitalId,
    hospitalName: reqRow.hospitalName,
    district: reqRow.district,
    area: reqRow.area,
    latitude: reqRow.latitude,
    longitude: reqRow.longitude,
    clinicalReason: reqRow.clinicalReason,
    requisitionSlipVerified: reqRow.requisitionSlipVerified,
    hospitalSlipDataUrl: isOwner || isAdmin || Boolean(actor) ? reqRow.hospitalSlipDataUrl : null,
    contactName: reqRow.contactName,
    contactPhone: revealPhone ? reqRow.contactPhonePrivate : null,
    maskedContactPhone: maskBangladeshPhone(reqRow.contactPhonePrivate),
    shareDirectContact: reqRow.shareDirectContact,
    escalationLevel: reqRow.escalationLevel,
    searchRadiusKm: reqRow.SearchRadiusKm,
    respondersCount: reqRow.respondersCount,
    responders: (responders || []).map((r) => ({
      id: r.id,
      donorUid: r.donorUid,
      donorName: r.donorName,
      donorBloodGroup: r.donorBloodGroup,
      status: r.responseStatus,
      etaMinutes: r.etaMinutes,
      note: r.note,
      respondedAt: r.respondedAt,
    })),
    expiresAt: reqRow.expiresAt,
    resolvedAt: reqRow.resolvedAt,
    createdAt: reqRow.createdAt,
  };
}

export async function expireStaleBloodRequestsTx(db: BloodSearchDatabase): Promise<number> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(bloodRequests)
      .set({
        status: 'EXPIRED',
        resolvedAt: now,
        resolutionReason: 'AUTO_EXPIRED_TTL',
        updatedAt: now,
      })
      .where(and(eq(bloodRequests.status, 'ACTIVE'), isNotNull(bloodRequests.expiresAt), lt(bloodRequests.expiresAt, now)))
      .returning({ id: bloodRequests.id });

    if (expired.length > 0) {
      const ids = expired.map((e) => e.id);
      await tx
        .update(emergencyAlerts)
        .set({ alertState: 'EXPIRED', stoppedAt: now })
        .where(
          and(
            inArray(emergencyAlerts.requestId, ids),
            inArray(emergencyAlerts.alertState, ['DISPATCHED', 'DELIVERED', 'FAILED_RETRYABLE'])
          )
        );
    }
    return expired.length;
  });
}

export async function retryFailedNotificationsAndAlertsTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor
): Promise<{ retriedNotifications: number; retriedAlerts: number }> {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Only Admins can trigger failed notification retry sweeps.');
  }
  return db.transaction(async (tx) => {
    const retriedNotifs = await tx
      .update(notifications)
      .set({
        deliveryStatus: 'RETRIED_DELIVERED',
        retryCount: sql`${notifications.retryCount} + 1`,
        lastError: null,
      })
      .where(and(eq(notifications.deliveryStatus, 'FAILED_RETRYABLE'), lt(notifications.retryCount, 5)))
      .returning({ id: notifications.id });

    const retriedAlerts = await tx
      .update(emergencyAlerts)
      .set({
        alertState: 'DELIVERED',
        retryCount: sql`${emergencyAlerts.retryCount} + 1`,
        lastError: null,
      })
      .where(and(eq(emergencyAlerts.alertState, 'FAILED_RETRYABLE'), lt(emergencyAlerts.retryCount, 5)))
      .returning({ id: emergencyAlerts.id });

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'FAILED_NOTIFICATIONS_RETRIED',
      targetEntityType: 'notifications',
      targetEntityId: 'batch',
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        retriedNotifications: retriedNotifs.length,
        retriedAlerts: retriedAlerts.length,
      },
    });

    return {
      retriedNotifications: retriedNotifs.length,
      retriedAlerts: retriedAlerts.length,
    };
  });
}

export async function listBloodRequestsPaginated(
  db: BloodSearchDatabase,
  actor: ResolvedActor | null,
  filters: { status?: string; bloodGroup?: string; district?: string; page?: number; limit?: number }
) {
  await expireStaleBloodRequestsTx(db).catch(() => {});

  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(filters.limit) || 20)));
  const offset = (page - 1) * limit;

  const conds = [];
  if (filters.status && filters.status.toUpperCase() !== 'ALL') {
    const st = String(filters.status).toUpperCase();
    if (!['ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED'].includes(st)) {
      throw new DomainSecurityError(400, 'INVALID_STATUS_FILTER', 'Invalid request status filter.');
    }
    conds.push(eq(bloodRequests.status, st));
  }
  if (filters.bloodGroup && filters.bloodGroup.toUpperCase() !== 'ALL') {
    conds.push(eq(bloodRequests.bloodGroup, assertBloodGroup(filters.bloodGroup)));
  }
  if (filters.district && filters.district.toUpperCase() !== 'ALL') {
    const dist = assertCleanText(filters.district, 'district', 80, 1);
    conds.push(sql`LOWER(${bloodRequests.district}) = LOWER(${dist})`);
  }

  const whereClause = conds.length > 0 ? and(...conds) : undefined;
  const [{ totalCount }] = await db.select({ totalCount: count() }).from(bloodRequests).where(whereClause);
  const rows = await db
    .select()
    .from(bloodRequests)
    .where(whereClause)
    .orderBy(desc(bloodRequests.createdAt))
    .limit(limit)
    .offset(offset);

  const reqIds = rows.map((r) => r.id);
  const responderMap = new Map<string, Array<typeof requestResponses.$inferSelect>>();
  if (reqIds.length > 0) {
    const respRows = await db
      .select()
      .from(requestResponses)
      .where(inArray(requestResponses.requestId, reqIds))
      .orderBy(desc(requestResponses.respondedAt));
    for (const rr of respRows) {
      const arr = responderMap.get(rr.requestId) || [];
      arr.push(rr);
      responderMap.set(rr.requestId, arr);
    }
  }

  return {
    items: rows.map((r) => sanitizeBloodRequestForCaller(r, actor, responderMap.get(r.id))),
    pagination: {
      page,
      limit,
      totalItems: Number(totalCount),
      totalPages: Math.max(1, Math.ceil(Number(totalCount) / limit)),
    },
  };
}

export async function respondToBloodRequestTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  requestId: string,
  payload: { responseStatus: 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED' | 'DECLINED'; etaMinutes?: number; note?: string }
) {
  return db.transaction(async (tx) => {
    const [reqRow] = await tx.select().from(bloodRequests).where(eq(bloodRequests.id, requestId)).limit(1);
    if (!reqRow) {
      throw new DomainSecurityError(404, 'REQUEST_NOT_FOUND', 'Blood request does not exist.');
    }
    if (reqRow.status !== 'ACTIVE') {
      throw new DomainSecurityError(409, 'REQUEST_NOT_ACTIVE', `Cannot respond to a ${reqRow.status} blood request.`);
    }
    if (reqRow.requesterUid === actor.uid) {
      throw new DomainSecurityError(400, 'CANNOT_RESPOND_OWN_REQUEST', 'Requester cannot respond as donor to own request.');
    }

    const [donor] = await tx.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);
    if (!donor) {
      throw new DomainSecurityError(400, 'DONOR_PROFILE_REQUIRED', 'Complete your donor profile before accepting an SOS request.');
    }

    const [resp] = await tx
      .insert(requestResponses)
      .values({
        requestId,
        donorUid: actor.uid,
        donorName: donor.publicName,
        donorBloodGroup: donor.bloodGroup,
        responseStatus: payload.responseStatus,
        etaMinutes: payload.etaMinutes ?? null,
        note: payload.note ? assertCleanText(payload.note, 'note', 280, 1) : null,
      })
      .onConflictDoUpdate({
        target: [requestResponses.requestId, requestResponses.donorUid],
        set: {
          responseStatus: payload.responseStatus,
          etaMinutes: payload.etaMinutes ?? null,
          note: payload.note ? assertCleanText(payload.note, 'note', 280, 1) : null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const [{ activeCount }] = await tx
      .select({ activeCount: count() })
      .from(requestResponses)
      .where(
        and(
          eq(requestResponses.requestId, requestId),
          inArray(requestResponses.responseStatus, ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DONATED'])
        )
      );

    await tx
      .update(bloodRequests)
      .set({ respondersCount: Number(activeCount), updatedAt: new Date() })
      .where(eq(bloodRequests.id, requestId));

    await tx.insert(notifications).values({
      recipientUid: reqRow.requesterUid,
      notificationType: 'SOS_MATCH',
      title: `${donor.publicName} (${donor.bloodGroup}) সাড়া দিয়েছেন`,
      body: `স্ট্যাটাস: ${payload.responseStatus}`,
      relatedRequestId: requestId,
    });

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `SOS_RESPONSE_${payload.responseStatus}`,
      targetEntityType: 'blood_requests',
      targetEntityId: requestId,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return resp!;
  });
}

export async function transitionBloodRequestStateTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  requestId: string,
  transition: {
    nextStatus: 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
    reason?: string;
    fulfilledByDonorUid?: string;
    unitsDonated?: number;
  }
) {
  if (!TERMINAL_REQUEST_STATES.has(transition.nextStatus)) {
    throw new DomainSecurityError(400, 'INVALID_TARGET_STATE', 'Target status must be FULFILLED, CANCELLED, or EXPIRED.');
  }

  return db.transaction(async (tx) => {
    const [reqRow] = await tx.select().from(bloodRequests).where(eq(bloodRequests.id, requestId)).limit(1);
    if (!reqRow) {
      throw new DomainSecurityError(404, 'REQUEST_NOT_FOUND', 'Blood request not found.');
    }

    if (reqRow.requesterUid !== actor.uid && !isAdminRole(actor.role)) {
      await writeAuditLog(tx, {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: 'IDOR_REQUEST_STATE_CHANGE_BLOCKED',
        targetEntityType: 'blood_requests',
        targetEntityId: requestId,
        outcome: 'DENIED',
        ipHash: actor.ipHash,
      });
      throw new DomainSecurityError(
        403,
        'FORBIDDEN_NOT_OWNER',
        'Only the request creator or an authorized administrator can change this request status.'
      );
    }

    if (TERMINAL_REQUEST_STATES.has(reqRow.status)) {
      throw new DomainSecurityError(
        409,
        'INVALID_TERMINAL_TRANSITION',
        `Request is already in terminal state ${reqRow.status} and cannot transition to ${transition.nextStatus}.`
      );
    }

    const now = new Date();
    const [updatedRequest] = await tx
      .update(bloodRequests)
      .set({
        status: transition.nextStatus,
        bagsFulfilled: transition.nextStatus === 'FULFILLED' ? reqRow.bagsNeeded : reqRow.bagsFulfilled,
        resolvedByUid: actor.uid,
        resolvedAt: now,
        resolutionReason: transition.reason ? assertCleanText(transition.reason, 'reason', 160, 1) : transition.nextStatus,
        updatedAt: now,
      })
      .where(eq(bloodRequests.id, requestId))
      .returning();

    const haltedAlerts = await tx
      .update(emergencyAlerts)
      .set({
        alertState: 'STOPPED_RESOLVED',
        stoppedAt: now,
      })
      .where(
        and(
          eq(emergencyAlerts.requestId, requestId),
          inArray(emergencyAlerts.alertState, ['DISPATCHED', 'DELIVERED', 'FAILED_RETRYABLE'])
        )
      )
      .returning();

    await tx
      .update(liveDonorTrips)
      .set({
        tripStatus: transition.nextStatus === 'FULFILLED' ? 'COMPLETED' : 'STOPPED',
        updatedAt: now,
      })
      .where(and(eq(liveDonorTrips.requestId, requestId), eq(liveDonorTrips.tripStatus, 'EN_ROUTE')));

    let recordedDonation = null;
    if (transition.nextStatus === 'FULFILLED' && transition.fulfilledByDonorUid) {
      const units = Math.min(4, Math.max(1, Number(transition.unitsDonated) || 1));
      const cooldownUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const certCode = `CERT-${now.getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const [donationRow] = await tx
        .insert(donations)
        .values({
          donorUid: transition.fulfilledByDonorUid,
          requestId,
          hospitalId: reqRow.hospitalId,
          hospitalName: reqRow.hospitalName,
          bloodGroup: reqRow.bloodGroup,
          unitsDonated: units,
          donatedAt: now,
          cooldownUntil,
          verifiedByUid: actor.uid,
          certificateCode: certCode,
        })
        .returning();
      recordedDonation = donationRow;

      await tx
        .update(donorProfiles)
        .set({
          totalDonations: sql`${donorProfiles.totalDonations} + 1`,
          lastDonationDate: now,
          nextEligibleDate: cooldownUntil,
          availabilityStatus: 'COOLDOWN',
          isAvailable: false,
          updatedAt: now,
        })
        .where(eq(donorProfiles.userUid, transition.fulfilledByDonorUid));
    }

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `REQUEST_TRANSITION_${transition.nextStatus}`,
      targetEntityType: 'blood_requests',
      targetEntityId: requestId,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        previousStatus: reqRow.status,
        nextStatus: transition.nextStatus,
        haltedAlertsCount: haltedAlerts.length,
        recordedDonationId: recordedDonation?.id || null,
      },
    });

    return {
      request: sanitizeBloodRequestForCaller(updatedRequest!, actor),
      haltedAlertsCount: haltedAlerts.length,
      donation: recordedDonation,
    };
  });
}

export async function escalateBloodRequestTx(db: BloodSearchDatabase, actor: ResolvedActor, requestId: string) {
  return db.transaction(async (tx) => {
    const [reqRow] = await tx.select().from(bloodRequests).where(eq(bloodRequests.id, requestId)).limit(1);
    if (!reqRow) {
      throw new DomainSecurityError(404, 'REQUEST_NOT_FOUND', 'Blood request not found.');
    }
    if (reqRow.requesterUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_NOT_OWNER', 'Only the request owner or Admin can escalate an SOS alert.');
    }
    if (reqRow.status !== 'ACTIVE') {
      throw new DomainSecurityError(
        409,
        'CANNOT_ESCALATE_TERMINAL_REQUEST',
        `Cannot escalate request in ${reqRow.status} state.`
      );
    }
    if (reqRow.escalationLevel >= 4) {
      throw new DomainSecurityError(409, 'MAX_ESCALATION_REACHED', 'Request has already reached maximum nationwide tier (Level 4).');
    }

    const nextLevel = reqRow.escalationLevel + 1;
    const nextRadiusKm = ESCALATION_RADIUS_BY_LEVEL[nextLevel] || 500;

    const [updated] = await tx
      .update(bloodRequests)
      .set({
        escalationLevel: nextLevel,
        SearchRadiusKm: nextRadiusKm,
        updatedAt: new Date(),
      })
      .where(eq(bloodRequests.id, requestId))
      .returning();

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'SOS_ESCALATED',
      targetEntityType: 'blood_requests',
      targetEntityId: requestId,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: { escalationLevel: nextLevel, radiusKm: nextRadiusKm },
    });

    return sanitizeBloodRequestForCaller(updated!, actor);
  });
}

// ============================================================================
// 5. ADMIN & SUPER ADMIN OPERATIONS (BLOOD INVENTORY, RBAC, AUDIT LOGS)
// ============================================================================
export async function updateBloodInventoryTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  input: {
    bloodBankCode: string;
    bloodBankName: string;
    district: string;
    address: string;
    contactPhone: string;
    bloodGroup: string;
    componentType?: 'WHOLE_BLOOD' | 'PACKED_RBC' | 'PLATELETS' | 'PLASMA';
    unitsAvailable: number;
    criticalThreshold?: number;
  }
) {
  if (!isAdminRole(actor.role)) {
    await writeAuditLog(db, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'UNAUTHORIZED_INVENTORY_UPDATE',
      targetEntityType: 'blood_inventory',
      targetEntityId: input.bloodBankCode || 'unknown',
      outcome: 'DENIED',
      ipHash: actor.ipHash,
    });
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Only verified Admins can modify blood bank inventory.');
  }

  const bloodGroup = assertBloodGroup(input.bloodGroup);
  const unitsAvailable = Number(input.unitsAvailable);
  const criticalThreshold = Number(input.criticalThreshold ?? 5);
  if (!Number.isInteger(unitsAvailable) || unitsAvailable < 0 || !Number.isInteger(criticalThreshold) || criticalThreshold < 0) {
    throw new DomainSecurityError(400, 'INVALID_INVENTORY_UNITS', 'Units available and threshold must be non-negative integers.');
  }

  const stockStatus =
    unitsAvailable === 0
      ? 'OUT_OF_STOCK'
      : unitsAvailable <= criticalThreshold
        ? 'CRITICAL'
        : unitsAvailable <= criticalThreshold * 2
          ? 'LOW'
          : 'ADEQUATE';

  const componentType = input.componentType || 'WHOLE_BLOOD';

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [bank] = await tx
      .insert(bloodBanks)
      .values({
        code: assertCleanText(input.bloodBankCode, 'bloodBankCode', 64, 2).toUpperCase(),
        name: assertCleanText(input.bloodBankName, 'bloodBankName', 200, 2),
        district: assertCleanText(input.district, 'district', 80, 2),
        address: assertCleanText(input.address, 'address', 300, 2),
        contactPhone: assertCleanText(input.contactPhone, 'contactPhone', 32, 3),
      })
      .onConflictDoUpdate({
        target: bloodBanks.code,
        set: {
          name: assertCleanText(input.bloodBankName, 'bloodBankName', 200, 2),
          updatedAt: new Date(),
        },
      })
      .returning();

    const [inv] = await tx
      .insert(bloodInventory)
      .values({
        bloodBankId: bank!.id,
        bloodGroup,
        componentType,
        unitsAvailable,
        criticalThreshold,
        stockStatus,
        updatedByUid: actor.uid,
      })
      .onConflictDoUpdate({
        target: [bloodInventory.bloodBankId, bloodInventory.bloodGroup, bloodInventory.componentType],
        set: {
          unitsAvailable,
          criticalThreshold,
          stockStatus,
          updatedByUid: actor.uid,
          updatedAt: new Date(),
        },
      })
      .returning();

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'BLOOD_INVENTORY_UPDATED',
      targetEntityType: 'blood_inventory',
      targetEntityId: inv!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: {
        bloodBankCode: bank!.code,
        bloodGroup,
        unitsAvailable,
        stockStatus,
      },
    });

    return { bank: bank!, inventory: inv! };
  });
}

export async function listBloodInventory(db: BloodSearchDatabase, district?: string) {
  return db
    .select({
      inventoryId: bloodInventory.id,
      bankCode: bloodBanks.code,
      bankName: bloodBanks.name,
      district: bloodBanks.district,
      contactPhone: bloodBanks.contactPhone,
      bloodGroup: bloodInventory.bloodGroup,
      componentType: bloodInventory.componentType,
      unitsAvailable: bloodInventory.unitsAvailable,
      criticalThreshold: bloodInventory.criticalThreshold,
      stockStatus: bloodInventory.stockStatus,
      updatedAt: bloodInventory.updatedAt,
    })
    .from(bloodInventory)
    .innerJoin(bloodBanks, eq(bloodInventory.bloodBankId, bloodBanks.id))
    .where(district ? sql`LOWER(${bloodBanks.district}) = LOWER(${assertCleanText(district, 'district', 80, 1)})` : undefined)
    .orderBy(asc(bloodBanks.district), asc(bloodInventory.bloodGroup));
}

export async function manageAdminRoleTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  target: {
    targetUid: string;
    targetEmail: string;
    role: 'CO_ADMIN' | 'MODERATOR';
    isActive: boolean;
    permissions?: string[];
  }
) {
  if (actor.role !== 'SUPER_ADMIN') {
    await writeAuditLog(db, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'PRIVILEGE_ESCALATION_BLOCKED',
      targetEntityType: 'admin_roles',
      targetEntityId: target.targetUid,
      outcome: 'DENIED',
      ipHash: actor.ipHash,
    });
    throw new DomainSecurityError(
      403,
      'SUPER_ADMIN_REQUIRED',
      'Strictly restricted to Super Owner. Co-Admins cannot grant or revoke administrative roles.'
    );
  }

  const cleanEmail = assertCleanText(target.targetEmail, 'targetEmail', 255, 5).toLowerCase();
  const targetUid = assertCleanText(target.targetUid, 'targetUid', 128, 3);

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    await tx
      .insert(users)
      .values({
        uid: targetUid,
        email: cleanEmail,
        emailVerified: true,
        displayName: cleanEmail.split('@')[0] || 'Admin User',
      })
      .onConflictDoNothing({ target: users.uid });

    const now = new Date();
    const [roleRecord] = await tx
      .insert(adminRoles)
      .values({
        userUid: targetUid,
        email: cleanEmail,
        role: target.role,
        permissionsJson: target.permissions || ['MANAGE_REQUESTS', 'VERIFY_DONORS', 'MANAGE_INVENTORY'],
        isActive: target.isActive,
        grantedByUid: actor.uid,
        revokedByUid: target.isActive ? null : actor.uid,
        revokedAt: target.isActive ? null : now,
      })
      .onConflictDoUpdate({
        target: adminRoles.userUid,
        set: {
          role: target.role,
          permissionsJson: target.permissions || ['MANAGE_REQUESTS', 'VERIFY_DONORS', 'MANAGE_INVENTORY'],
          isActive: target.isActive,
          revokedByUid: target.isActive ? null : actor.uid,
          revokedAt: target.isActive ? null : now,
          updatedAt: now,
        },
      })
      .returning();

    // Rotate/revoke existing sessions for targetUid upon privilege change!
    await tx
      .update(loginSessions)
      .set({ isRevoked: true, revokedReason: 'ADMIN_PRIVILEGE_CHANGED' })
      .where(and(eq(loginSessions.userUid, targetUid), eq(loginSessions.isRevoked, false)));

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: target.isActive ? 'ADMIN_ROLE_GRANTED' : 'ADMIN_ROLE_REVOKED',
      targetEntityType: 'admin_roles',
      targetEntityId: targetUid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: { role: target.role, isActive: target.isActive },
    });

    return roleRecord!;
  });
}

export async function upsertDeviceTokenTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    pushToken?: string;
    deviceToken?: string;
    platform: 'WEB_PWA' | 'ANDROID_APK' | 'IOS_WEB';
    deviceLabel?: string;
  }
) {
  const token = assertCleanText(payload.pushToken || payload.deviceToken, 'pushToken', 2048, 16);
  if (!['WEB_PWA', 'ANDROID_APK', 'IOS_WEB'].includes(payload.platform)) {
    throw new DomainSecurityError(400, 'INVALID_PLATFORM', 'Platform must be WEB_PWA, ANDROID_APK, or IOS_WEB.');
  }

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [saved] = await tx
      .insert(deviceTokens)
      .values({
        userUid: actor.uid,
        pushToken: token,
        platform: payload.platform,
        deviceLabel: payload.deviceLabel ? assertCleanText(payload.deviceLabel, 'deviceLabel', 140, 1) : null,
        isActive: true,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: deviceTokens.pushToken,
        set: {
          userUid: actor.uid,
          platform: payload.platform,
          isActive: true,
          lastSeenAt: new Date(),
        },
      })
      .returning();

    return saved!;
  });
}

export async function recordLoginSessionTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    rawTokenFragment: string;
    authMethod: 'GOOGLE_OIDC' | 'GOOGLE_OAUTH' | 'EMAIL_PASSWORD' | 'PHONE_OTP' | 'ADMIN_CONSOLE';
    userAgent?: string;
    isAdminConsole?: boolean;
  }
) {
  if (payload.isAdminConsole && !isAdminRole(actor.role)) {
    await writeAuditLog(db, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'ADMIN_CONSOLE_SESSION_DENIED',
      targetEntityType: 'login_sessions',
      targetEntityId: actor.uid,
      outcome: 'DENIED',
      ipHash: actor.ipHash,
    });
    throw new DomainSecurityError(403, 'ADMIN_CONSOLE_FORBIDDEN', 'Unauthorized user cannot establish an Admin Console session.');
  }

  const tokenHash = crypto.createHash('sha256').update(`${actor.uid}:${payload.rawTokenFragment}`).digest('hex');
  const csrfHash = crypto.createHash('sha256').update(`csrf:${actor.uid}:${payload.rawTokenFragment}`).digest('hex');

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const expiresAt = new Date(Date.now() + (payload.isAdminConsole ? 4 : 24) * 60 * 60 * 1000);
    const [session] = await tx
      .insert(loginSessions)
      .values({
        userUid: actor.uid,
        sessionTokenHash: tokenHash,
        csrfTokenHash: csrfHash,
        authMethod: payload.authMethod === 'GOOGLE_OAUTH' ? 'GOOGLE_OIDC' : payload.authMethod,
        ipHash: actor.ipHash,
        userAgentSummary: payload.userAgent ? String(payload.userAgent).slice(0, 250) : null,
        isAdminConsole: Boolean(payload.isAdminConsole),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: loginSessions.sessionTokenHash,
        set: {
          lastActiveAt: new Date(),
          expiresAt,
          isRevoked: false,
        },
      })
      .returning();

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: payload.isAdminConsole ? 'ADMIN_CONSOLE_LOGIN' : 'USER_SESSION_RECORDED',
      targetEntityType: 'login_sessions',
      targetEntityId: session!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return session!;
  });
}

export async function queryAuditLogsPaginated(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  page = 1,
  limit = 25
) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Only verified Admins can view PostgreSQL security audit logs.');
  }
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  const [{ totalCount }] = await db.select({ totalCount: count() }).from(auditLogs);
  const items = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(safeLimit)
    .offset(offset);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalItems: Number(totalCount),
      totalPages: Math.max(1, Math.ceil(Number(totalCount) / safeLimit)),
    },
  };
}

export async function listHospitalsByDistrict(db: BloodSearchDatabase, district?: string) {
  return db
    .select()
    .from(hospitals)
    .where(district ? sql`LOWER(${hospitals.district}) = LOWER(${assertCleanText(district, 'district', 80, 1)})` : undefined)
    .orderBy(asc(hospitals.district), asc(hospitals.nameEn))
    .limit(100);
}

// ============================================================================
// 6. USER ACCOUNT, DONATIONS, ALERTS, NOTIFICATIONS, LIVE TRIPS, CHAT & ADMIN
// ============================================================================
export async function getUserFullAccount(db: BloodSearchDatabase, actor: ResolvedActor) {
  const [userRow] = await db.select().from(users).where(eq(users.uid, actor.uid)).limit(1);
  const [donorRow] = await db.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);
  const [contactRow] = await db.select().from(privateContacts).where(eq(privateContacts.userUid, actor.uid)).limit(1);
  const donationRows = await db
    .select()
    .from(donations)
    .where(eq(donations.donorUid, actor.uid))
    .orderBy(desc(donations.donatedAt))
    .limit(50);

  return {
    user: userRow || null,
    donorProfile: donorRow || null,
    privateContact: contactRow || null,
    donations: donationRows,
    role: actor.role,
  };
}

export async function updateUserAccountTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  patch: {
    displayName?: string;
    photoUrl?: string | null;
    bloodGroup?: string | null;
    district?: string | null;
    area?: string | null;
    preferredLanguage?: 'bn' | 'en';
    familyCircleJson?: unknown[];
  }
) {
  const now = new Date();
  const safePhoto = patch.photoUrl !== undefined ? validateSafeImageDataUrl(patch.photoUrl, 250_000) : undefined;
  const cleanBg = patch.bloodGroup ? assertBloodGroup(patch.bloodGroup) : undefined;

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [updated] = await tx
      .update(users)
      .set({
        ...(patch.displayName ? { displayName: assertCleanText(patch.displayName, 'displayName', 140, 2) } : {}),
        ...(safePhoto !== undefined ? { photoUrl: safePhoto } : {}),
        ...(cleanBg !== undefined ? { bloodGroup: cleanBg } : {}),
        ...(patch.district !== undefined
          ? { district: patch.district ? assertCleanText(patch.district, 'district', 80, 1) : null }
          : {}),
        ...(patch.area !== undefined
          ? { area: patch.area ? assertCleanText(patch.area, 'area', 160, 1) : null }
          : {}),
        ...(patch.preferredLanguage && ['bn', 'en'].includes(patch.preferredLanguage)
          ? { preferredLanguage: patch.preferredLanguage }
          : {}),
        ...(Array.isArray(patch.familyCircleJson)
          ? { familyCircleJson: patch.familyCircleJson.slice(0, 12) }
          : {}),
        updatedAt: now,
      })
      .where(eq(users.uid, actor.uid))
      .returning();

    return updated || null;
  });
}

export async function recordManualDonationTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    hospitalName: string;
    bloodGroup: string;
    unitsDonated?: number;
    donatedAt?: string | Date;
    notes?: string;
  }
) {
  const hospitalName = assertCleanText(payload.hospitalName, 'hospitalName', 200, 2);
  const bloodGroup = assertBloodGroup(payload.bloodGroup);
  const units = Math.min(4, Math.max(1, Math.floor(Number(payload.unitsDonated || 1))));
  const donatedAt = payload.donatedAt ? new Date(payload.donatedAt) : new Date();
  if (Number.isNaN(donatedAt.getTime())) {
    throw new DomainSecurityError(400, 'INVALID_DATE', 'Invalid donation date.');
  }
  const cooldownUntil = new Date(donatedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  const certCode = `CERT-${donatedAt.getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [created] = await tx
      .insert(donations)
      .values({
        donorUid: actor.uid,
        hospitalName,
        bloodGroup,
        unitsDonated: units,
        donatedAt,
        cooldownUntil,
        certificateCode: certCode,
        notes: payload.notes ? assertCleanText(payload.notes, 'notes', 300, 1) : null,
      })
      .returning();

    const isStillInCooldown = cooldownUntil.getTime() > Date.now();
    await tx
      .update(donorProfiles)
      .set({
        totalDonations: sql`${donorProfiles.totalDonations} + 1`,
        lastDonationDate: donatedAt,
        nextEligibleDate: cooldownUntil,
        ...(isStillInCooldown ? { availabilityStatus: 'COOLDOWN', isAvailable: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(donorProfiles.userUid, actor.uid));

    return created!;
  });
}

export async function listEmergencyAlertsForActor(db: BloodSearchDatabase, actor: ResolvedActor) {
  const rows = await db
    .select({
      alert: emergencyAlerts,
      request: bloodRequests,
    })
    .from(emergencyAlerts)
    .innerJoin(bloodRequests, eq(emergencyAlerts.requestId, bloodRequests.id))
    .where(
      isAdminRole(actor.role)
        ? eq(bloodRequests.status, 'ACTIVE')
        : and(eq(emergencyAlerts.targetDonorUid, actor.uid), eq(bloodRequests.status, 'ACTIVE'))
    )
    .orderBy(desc(emergencyAlerts.dispatchedAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.alert.id,
    requestId: r.alert.requestId,
    targetDonorUid: r.alert.targetDonorUid,
    escalationLevel: r.alert.escalationLevel,
    radiusKm: r.alert.radiusKm,
    channel: r.alert.channel,
    alertState: r.alert.alertState,
    dispatchedAt: r.alert.dispatchedAt,
    patientName: r.request.patientName,
    bloodGroup: r.request.bloodGroup,
    bagsNeeded: r.request.bagsNeeded,
    urgency: r.request.urgency,
    hospitalName: r.request.hospitalName,
    district: r.request.district,
    area: r.request.area,
  }));
}

export async function listNotificationsForActor(db: BloodSearchDatabase, actor: ResolvedActor) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUid, actor.uid))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationsReadTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  notificationId?: string
) {
  const now = new Date();
  if (notificationId) {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUid, actor.uid)));
  } else {
    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.recipientUid, actor.uid), eq(notifications.isRead, false)));
  }
}

// ============================================================================
// LIVE DONOR GPS TRIPS
// ============================================================================
export async function upsertLiveDonorTripTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    requestId: string;
    currentLat: number;
    currentLng: number;
    hospitalLat?: number | null;
    hospitalLng?: number | null;
    etaMinutes?: number | null;
    distanceKm?: number | null;
    tripStatus?: 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'STOPPED';
  }
) {
  const { lat, lng } = assertOptionalCoordinates(payload.currentLat, payload.currentLng);
  if (lat === null || lng === null) {
    throw new DomainSecurityError(400, 'INVALID_COORDINATES', 'Live trip requires valid latitude and longitude.');
  }

  return db.transaction(async (tx) => {
    const [reqRow] = await tx.select().from(bloodRequests).where(eq(bloodRequests.id, payload.requestId)).limit(1);
    if (!reqRow) {
      throw new DomainSecurityError(404, 'REQUEST_NOT_FOUND', 'Blood request not found.');
    }

    const [donor] = await tx.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);
    const [existing] = await tx
      .select()
      .from(liveDonorTrips)
      .where(and(eq(liveDonorTrips.requestId, payload.requestId), eq(liveDonorTrips.donorUid, actor.uid)))
      .limit(1);

    const status = payload.tripStatus || 'EN_ROUTE';
    if (existing) {
      const [updated] = await tx
        .update(liveDonorTrips)
        .set({
          currentLat: lat,
          currentLng: lng,
          ...(payload.etaMinutes !== undefined ? { etaMinutes: payload.etaMinutes } : {}),
          ...(payload.distanceKm !== undefined ? { distanceKm: payload.distanceKm } : {}),
          tripStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(liveDonorTrips.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await tx
      .insert(liveDonorTrips)
      .values({
        requestId: payload.requestId,
        donorUid: actor.uid,
        requesterUid: reqRow.requesterUid,
        donorName: donor?.publicName || actor.displayName || 'Responder',
        bloodGroup: donor?.bloodGroup || reqRow.bloodGroup,
        currentLat: lat,
        currentLng: lng,
        hospitalLat: payload.hospitalLat ?? reqRow.latitude ?? null,
        hospitalLng: payload.hospitalLng ?? reqRow.longitude ?? null,
        etaMinutes: payload.etaMinutes ?? null,
        distanceKm: payload.distanceKm ?? null,
        tripStatus: status,
      })
      .returning();

    return created!;
  });
}

export async function listActiveLiveDonorTrips(
  db: BloodSearchDatabase,
  actor: ResolvedActor
) {
  const statusCond = inArray(liveDonorTrips.tripStatus, ['EN_ROUTE', 'ARRIVED']);
  const accessCond = isAdminRole(actor.role)
    ? statusCond
    : and(
        statusCond,
        or(eq(liveDonorTrips.donorUid, actor.uid), eq(liveDonorTrips.requesterUid, actor.uid))
      );

  return db
    .select()
    .from(liveDonorTrips)
    .where(accessCond)
    .orderBy(desc(liveDonorTrips.updatedAt))
    .limit(50);
}

export async function updateLiveDonorTripStatusTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  tripIdOrComposite: string,
  nextStatus: 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'STOPPED'
) {
  const cleanId = assertCleanText(tripIdOrComposite, 'tripId', 160, 2);
  const parts = cleanId.includes('__') ? cleanId.split('__') : null;

  return db.transaction(async (tx) => {
    const [existing] = parts && parts.length === 2
      ? await tx
          .select()
          .from(liveDonorTrips)
          .where(and(eq(liveDonorTrips.requestId, parts[0]!), eq(liveDonorTrips.donorUid, parts[1]!)))
          .limit(1)
      : await tx
          .select()
          .from(liveDonorTrips)
          .where(sql`${liveDonorTrips.id}::text = ${cleanId}`)
          .limit(1);

    if (!existing) {
      throw new DomainSecurityError(404, 'TRIP_NOT_FOUND', 'Live donor trip not found.');
    }

    const isParticipant =
      existing.donorUid === actor.uid || existing.requesterUid === actor.uid || isAdminRole(actor.role);
    if (!isParticipant) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only trip participants can update trip status.');
    }

    if (existing.tripStatus === 'COMPLETED' || existing.tripStatus === 'STOPPED') {
      return existing;
    }

    const [updated] = await tx
      .update(liveDonorTrips)
      .set({
        tripStatus: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(liveDonorTrips.id, existing.id))
      .returning();

    return updated!;
  });
}


// ============================================================================
// COMMUNITY CHAT & DIRECT 1-TO-1 CHAT (STRICT PARTICIPANT ISOLATION)
// ============================================================================
export async function listCommunityMessages(db: BloodSearchDatabase, district?: string, limit = 60) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const rows = await db
    .select()
    .from(communityMessages)
    .where(
      district && district.toUpperCase() !== 'ALL'
        ? sql`LOWER(${communityMessages.district}) = LOWER(${assertCleanText(district, 'district', 80, 1)})`
        : undefined
    )
    .orderBy(desc(communityMessages.createdAt))
    .limit(safeLimit);

  return rows.reverse();
}

export async function postCommunityMessageTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    messageText: string;
    district?: string | null;
    attachmentType?: 'NONE' | 'GPS_PIN' | 'SLIP_PHOTO' | 'SOS_CARD';
    attachmentJson?: Record<string, unknown> | null;
    replyToId?: string | null;
    replyToName?: string | null;
    replyToText?: string | null;
  }
) {
  const text = sanitizeOutputText(assertCleanText(payload.messageText, 'messageText', 1000, 1), 1000);
  if (payload.attachmentType === 'SLIP_PHOTO' && payload.attachmentJson?.dataUrl) {
    validateSafeImageDataUrl(payload.attachmentJson.dataUrl, 300_000);
  }

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);
    const [donor] = await tx.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);

    const [msg] = await tx
      .insert(communityMessages)
      .values({
        senderUid: actor.uid,
        senderName: donor?.publicName || actor.displayName || actor.email?.split('@')[0] || 'Member',
        senderAvatar: donor?.avatarUrl || actor.photoUrl || null,
        senderRole: actor.role,
        isVerifiedDonor: Boolean(donor?.isVerified),
        senderBloodGroup: donor?.bloodGroup || null,
        district: payload.district ? assertCleanText(payload.district, 'district', 80, 1) : donor?.district || null,
        messageText: text,
        attachmentType: payload.attachmentType || 'NONE',
        attachmentJson: payload.attachmentJson || null,
        replyToId: payload.replyToId ? String(payload.replyToId).slice(0, 80) : null,
        replyToName: payload.replyToName ? sanitizeOutputText(payload.replyToName, 140) : null,
        replyToText: payload.replyToText ? sanitizeOutputText(payload.replyToText, 240) : null,
      })
      .returning();

    return msg!;
  });
}

export async function toggleCommunityMessageReactionTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  messageId: string,
  emoji: string
) {
  const allowedEmojis = new Set(['❤️', '🙏', '🩸', '👍', '💪']);
  if (!allowedEmojis.has(emoji)) {
    throw new DomainSecurityError(400, 'INVALID_REACTION', 'Unsupported reaction emoji.');
  }
  return db.transaction(async (tx) => {
    const [msg] = await tx.select().from(communityMessages).where(eq(communityMessages.id, messageId)).limit(1);
    if (!msg) {
      throw new DomainSecurityError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    }
    const reactions: Record<string, string[]> = { ...(msg.reactionsJson || {}) };
    const existing = Array.isArray(reactions[emoji]) ? [...reactions[emoji]!] : [];
    const idx = existing.indexOf(actor.uid);
    if (idx >= 0) existing.splice(idx, 1);
    else existing.push(actor.uid);
    reactions[emoji] = existing;

    const [updated] = await tx
      .update(communityMessages)
      .set({ reactionsJson: reactions })
      .where(eq(communityMessages.id, messageId))
      .returning();
    return updated!;
  });
}

export async function deleteCommunityMessageTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  messageId: string
) {
  return db.transaction(async (tx) => {
    const [msg] = await tx.select().from(communityMessages).where(eq(communityMessages.id, messageId)).limit(1);
    if (!msg) {
      throw new DomainSecurityError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
    }
    if (msg.senderUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'You can only delete your own community messages.');
    }
    await tx.delete(communityMessages).where(eq(communityMessages.id, messageId));
  });
}

export function buildDeterministicRoomId(uidA: string, uidB: string): string {
  return [uidA.trim(), uidB.trim()].sort().join('__').slice(0, 160);
}

export async function getOrCreateDirectChatRoomTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  peerUid: string,
  meta?: { peerName?: string; relatedRequestId?: string; hospitalName?: string }
) {
  const cleanPeer = assertCleanText(peerUid, 'peerUid', 128, 2);
  if (cleanPeer === actor.uid) {
    throw new DomainSecurityError(400, 'SELF_CHAT_INVALID', 'Cannot open a direct chat room with yourself.');
  }

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    // Resolve if peerUid was passed as a donor_profiles.id
    const [peerDonor] = await tx
      .select()
      .from(donorProfiles)
      .where(or(eq(donorProfiles.userUid, cleanPeer), sql`${donorProfiles.id}::text = ${cleanPeer}`))
      .limit(1);
    const resolvedPeerUid = peerDonor?.userUid || cleanPeer;
    if (resolvedPeerUid === actor.uid) {
      throw new DomainSecurityError(400, 'SELF_CHAT_INVALID', 'Cannot open a direct chat room with yourself.');
    }

    const [peerUser] = await tx.select().from(users).where(eq(users.uid, resolvedPeerUid)).limit(1);
    if (!peerUser) {
      throw new DomainSecurityError(404, 'PEER_NOT_FOUND', 'Target user does not exist.');
    }

    const [actorDonor] = await tx.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);
    const sorted = [actor.uid, resolvedPeerUid].sort() as [string, string];
    const roomId = buildDeterministicRoomId(sorted[0], sorted[1]);

    const namesMap: Record<string, string> = {
      [actor.uid]: actorDonor?.publicName || actor.displayName || 'Member',
      [resolvedPeerUid]: peerDonor?.publicName || peerUser.displayName || meta?.peerName || 'Donor',
    };
    const bgMap: Record<string, string> = {};
    if (actorDonor?.bloodGroup) bgMap[actor.uid] = actorDonor.bloodGroup;
    if (peerDonor?.bloodGroup) bgMap[resolvedPeerUid] = peerDonor.bloodGroup;

    const [room] = await tx
      .insert(directChatRooms)
      .values({
        id: roomId,
        participantOneUid: sorted[0],
        participantTwoUid: sorted[1],
        participantNamesJson: namesMap,
        participantBloodGroupsJson: bgMap,
        relatedRequestId: meta?.relatedRequestId || null,
        hospitalName: meta?.hospitalName ? sanitizeOutputText(meta.hospitalName, 200) : null,
      })
      .onConflictDoUpdate({
        target: directChatRooms.id,
        set: {
          participantNamesJson: namesMap,
        },
      })
      .returning();

    return room!;
  });
}

export async function listDirectChatRoomsForActor(db: BloodSearchDatabase, actor: ResolvedActor) {
  return db
    .select()
    .from(directChatRooms)
    .where(or(eq(directChatRooms.participantOneUid, actor.uid), eq(directChatRooms.participantTwoUid, actor.uid)))
    .orderBy(desc(directChatRooms.lastMessageAt))
    .limit(50);
}

export async function listDirectMessagesForRoom(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  roomId: string
) {
  const [room] = await db.select().from(directChatRooms).where(eq(directChatRooms.id, roomId)).limit(1);
  if (!room) {
    throw new DomainSecurityError(404, 'CHAT_ROOM_NOT_FOUND', 'Direct chat room does not exist.');
  }
  if (room.participantOneUid !== actor.uid && room.participantTwoUid !== actor.uid) {
    await writeAuditLog(db, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'IDOR_DIRECT_CHAT_READ_BLOCKED',
      targetEntityType: 'direct_chat_rooms',
      targetEntityId: roomId,
      outcome: 'DENIED',
      ipHash: actor.ipHash,
    });
    throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Access restricted to chat participants.');
  }

  const msgs = await db
    .select()
    .from(directMessages)
    .where(eq(directMessages.roomId, roomId))
    .orderBy(desc(directMessages.createdAt))
    .limit(80);

  return msgs.reverse();
}

export async function postDirectMessageTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  roomId: string,
  payload: {
    messageText: string;
    attachmentType?: string | null;
    metadataJson?: Record<string, unknown> | null;
  }
) {
  const text = sanitizeOutputText(assertCleanText(payload.messageText, 'messageText', 1000, 1), 1000);
  if (payload.attachmentType === 'SLIP_PHOTO' && payload.metadataJson?.dataUrl) {
    validateSafeImageDataUrl(payload.metadataJson.dataUrl, 300_000);
  }

  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(directChatRooms).where(eq(directChatRooms.id, roomId)).limit(1);
    if (!room) {
      throw new DomainSecurityError(404, 'CHAT_ROOM_NOT_FOUND', 'Direct chat room does not exist.');
    }
    if (room.participantOneUid !== actor.uid && room.participantTwoUid !== actor.uid) {
      await writeAuditLog(tx, {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: 'IDOR_DIRECT_CHAT_SEND_BLOCKED',
        targetEntityType: 'direct_chat_rooms',
        targetEntityId: roomId,
        outcome: 'DENIED',
        ipHash: actor.ipHash,
      });
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only room participants can send messages.');
    }

    const [donor] = await tx.select().from(donorProfiles).where(eq(donorProfiles.userUid, actor.uid)).limit(1);
    const now = new Date();

    const [msg] = await tx
      .insert(directMessages)
      .values({
        roomId,
        senderUid: actor.uid,
        senderName: donor?.publicName || actor.displayName || 'Participant',
        senderBloodGroup: donor?.bloodGroup || null,
        messageText: text,
        attachmentType: payload.attachmentType ? String(payload.attachmentType).slice(0, 24) : null,
        metadataJson: payload.metadataJson || null,
      })
      .returning();

    await tx
      .update(directChatRooms)
      .set({
        lastMessagePreview: text.slice(0, 140),
        lastSenderUid: actor.uid,
        lastMessageAt: now,
      })
      .where(eq(directChatRooms.id, roomId));

    const recipientUid = room.participantOneUid === actor.uid ? room.participantTwoUid : room.participantOneUid;
    await tx.insert(notifications).values({
      recipientUid,
      notificationType: 'DIRECT_MESSAGE',
      title: `নতুন মেসেজ (${donor?.publicName || actor.displayName || 'BloodSearch'})`,
      body: text.slice(0, 120),
      metadataJson: { roomId, senderUid: actor.uid },
    });

    return { message: msg!, room };
  });
}

// ============================================================================
// REPORTS, ANNOUNCEMENTS, OTA UPDATES, GRATITUDE WALL & ADMIN GOVERNANCE
// ============================================================================
export async function createScamReportTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    accusedUid?: string | null;
    accusedName?: string | null;
    accusedPhone?: string | null;
    category?: string;
    description: string;
  }
) {
  const description = sanitizeOutputText(assertCleanText(payload.description, 'description', 1000, 5), 1000);
  const category = payload.category ? assertCleanText(payload.category, 'category', 48, 2).toUpperCase() : 'ILLEGAL_MONEY_DEMAND';

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [created] = await tx
      .insert(reports)
      .values({
        reporterUid: actor.uid,
        reporterName: actor.displayName || actor.email?.split('@')[0] || 'Member',
        accusedUid: payload.accusedUid || null,
        accusedName: payload.accusedName ? sanitizeOutputText(payload.accusedName, 140) : null,
        accusedPhoneHash: payload.accusedPhone ? hashIdentifier(payload.accusedPhone) : null,
        category,
        description,
        status: 'OPEN',
      })
      .returning();

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'SCAM_REPORT_SUBMITTED',
      targetEntityType: 'reports',
      targetEntityId: created!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
      details: { category },
    });

    return created!;
  });
}

export async function listScamReportsAdmin(db: BloodSearchDatabase, actor: ResolvedActor) {
  if (!isAdminRole(actor.role) && actor.role !== 'MODERATOR') {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin or Moderator role required.');
  }
  return db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100);
}

export async function resolveScamReportAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  reportId: string,
  status: 'UNDER_REVIEW' | 'ACTION_TAKEN' | 'DISMISSED',
  resolutionNote?: string
) {
  if (!isAdminRole(actor.role) && actor.role !== 'MODERATOR') {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin or Moderator role required.');
  }
  const [updated] = await db
    .update(reports)
    .set({
      status,
      resolutionNote: resolutionNote ? sanitizeOutputText(resolutionNote, 400) : null,
      reviewedByUid: actor.uid,
      resolvedAt: new Date(),
    })
    .where(eq(reports.id, reportId))
    .returning();

  if (!updated) {
    throw new DomainSecurityError(404, 'REPORT_NOT_FOUND', 'Report not found.');
  }
  await writeAuditLog(db, {
    actorUid: actor.uid,
    actorRole: actor.role,
    action: `SCAM_REPORT_${status}`,
    targetEntityType: 'reports',
    targetEntityId: reportId,
    outcome: 'SUCCESS',
    ipHash: actor.ipHash,
  });
  return updated;
}

export async function listActiveAnnouncements(
  db: BloodSearchDatabase,
  announcementType?: 'BROADCAST' | 'OTA_APP_UPDATE'
) {
  const conds = [eq(announcements.isActive, true)];
  if (announcementType) {
    conds.push(eq(announcements.announcementType, announcementType));
  }
  return db
    .select()
    .from(announcements)
    .where(and(...conds))
    .orderBy(desc(announcements.createdAt))
    .limit(25);
}

export async function publishAnnouncementAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    announcementType?: 'BROADCAST' | 'OTA_APP_UPDATE';
    title: string;
    body: string;
    priority?: 'INFO' | 'WARNING' | 'CRITICAL';
    targetVersion?: string | null;
    apkDownloadUrl?: string | null;
    forceUpdate?: boolean;
  }
) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Only Admins can publish announcements or OTA updates.');
  }
  const type = payload.announcementType === 'OTA_APP_UPDATE' ? 'OTA_APP_UPDATE' : 'BROADCAST';
  const priority =
    payload.priority && ['INFO', 'WARNING', 'CRITICAL'].includes(payload.priority)
      ? payload.priority
      : 'INFO';

  let safeDownloadUrl: string | null = null;
  if (payload.apkDownloadUrl) {
    const raw = String(payload.apkDownloadUrl).trim();
    if (raw.startsWith('/downloads/') || raw.startsWith('https://')) {
      safeDownloadUrl = raw.slice(0, 500);
    } else {
      throw new DomainSecurityError(400, 'INVALID_DOWNLOAD_URL', 'APK download URL must use HTTPS or /downloads/.');
    }
  }

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    if (type === 'OTA_APP_UPDATE') {
      await tx
        .update(announcements)
        .set({ isActive: false })
        .where(eq(announcements.announcementType, 'OTA_APP_UPDATE'));
    }

    const [created] = await tx
      .insert(announcements)
      .values({
        announcementType: type,
        title: sanitizeOutputText(assertCleanText(payload.title, 'title', 220, 2), 220),
        body: sanitizeOutputText(assertCleanText(payload.body, 'body', 2000, 2), 2000),
        priority,
        targetVersion: payload.targetVersion ? assertCleanText(payload.targetVersion, 'targetVersion', 32, 1) : null,
        apkDownloadUrl: safeDownloadUrl,
        forceUpdate: Boolean(payload.forceUpdate),
        isActive: true,
        authorUid: actor.uid,
      })
      .returning();

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: type === 'OTA_APP_UPDATE' ? 'OTA_UPDATE_PUBLISHED' : 'ANNOUNCEMENT_PUBLISHED',
      targetEntityType: 'announcements',
      targetEntityId: created!.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return created!;
  });
}

export async function deleteAnnouncementAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  announcementId: string
) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
  }
  await db.update(announcements).set({ isActive: false }).where(eq(announcements.id, announcementId));
}

export async function listGratitudeNotes(db: BloodSearchDatabase, limit = 30) {
  return db
    .select()
    .from(gratitudeNotes)
    .orderBy(desc(gratitudeNotes.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
}

export async function postGratitudeNoteTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  payload: {
    honoredDonorUid?: string | null;
    honoredDonorName?: string | null;
    bloodGroup?: string | null;
    district?: string | null;
    message: string;
  }
) {
  const message = sanitizeOutputText(assertCleanText(payload.message, 'message', 600, 3), 600);
  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);
    const [created] = await tx
      .insert(gratitudeNotes)
      .values({
        authorUid: actor.uid,
        authorName: actor.displayName || actor.email?.split('@')[0] || 'Grateful Family',
        honoredDonorUid: payload.honoredDonorUid || null,
        honoredDonorName: payload.honoredDonorName ? sanitizeOutputText(payload.honoredDonorName, 140) : null,
        bloodGroup: payload.bloodGroup && VALID_BLOOD_GROUPS.has(payload.bloodGroup) ? payload.bloodGroup : null,
        district: payload.district ? assertCleanText(payload.district, 'district', 80, 1) : null,
        message,
      })
      .returning();
    return created!;
  });
}

// ============================================================================
// ADMIN DONOR VERIFICATION, USER GOVERNANCE, CO-ADMIN INVITE VAULT & SEEDING
// ============================================================================
export async function updateDonorVerificationAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  donorIdOrUid: string,
  isVerified: boolean
) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Only Admins can verify or revoke donor badges.');
  }
  const [updated] = await db
    .update(donorProfiles)
    .set({ isVerified, updatedAt: new Date() })
    .where(or(eq(donorProfiles.userUid, donorIdOrUid), sql`${donorProfiles.id}::text = ${donorIdOrUid}`))
    .returning();

  if (!updated) {
    throw new DomainSecurityError(404, 'DONOR_NOT_FOUND', 'Donor profile not found.');
  }

  await writeAuditLog(db, {
    actorUid: actor.uid,
    actorRole: actor.role,
    action: isVerified ? 'DONOR_BADGE_VERIFIED' : 'DONOR_BADGE_REVOKED',
    targetEntityType: 'donor_profiles',
    targetEntityId: updated.id,
    outcome: 'SUCCESS',
    ipHash: actor.ipHash,
  });

  return updated;
}

export async function deleteDonorProfileAdminOrSelfTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  donorIdOrUid: string
) {
  const [existing] = await db
    .select()
    .from(donorProfiles)
    .where(or(eq(donorProfiles.userUid, donorIdOrUid), sql`${donorProfiles.id}::text = ${donorIdOrUid}`))
    .limit(1);

  if (!existing) {
    throw new DomainSecurityError(404, 'DONOR_NOT_FOUND', 'Donor profile not found.');
  }

  if (existing.userUid !== actor.uid && !isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Not authorized to remove this donor profile.');
  }

  await db.transaction(async (tx) => {
    await tx.delete(privateContacts).where(eq(privateContacts.userUid, existing.userUid));
    await tx.delete(donorProfiles).where(eq(donorProfiles.id, existing.id));
    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'DONOR_PROFILE_REMOVED',
      targetEntityType: 'donor_profiles',
      targetEntityId: existing.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });
}

export async function listAdminsAdmin(db: BloodSearchDatabase, actor: ResolvedActor) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
  }
  return db.select().from(adminRoles).orderBy(desc(adminRoles.createdAt));
}

export async function listUsersAdmin(db: BloodSearchDatabase, actor: ResolvedActor, limit = 100) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
  }
  return db
    .select({
      uid: users.uid,
      email: users.email,
      emailVerified: users.emailVerified,
      phoneHint: users.phoneHint,
      displayName: users.displayName,
      bloodGroup: users.bloodGroup,
      district: users.district,
      accountStatus: users.accountStatus,
      authProvider: users.authProvider,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
}

export async function updateUserAccountStatusAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  targetUid: string,
  nextStatus: 'ACTIVE' | 'SUSPENDED'
) {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
  }
  if (targetUid === actor.uid) {
    throw new DomainSecurityError(400, 'CANNOT_SUSPEND_SELF', 'You cannot suspend your own account.');
  }

  const [targetUser] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
  if (!targetUser) {
    throw new DomainSecurityError(404, 'USER_NOT_FOUND', 'User not found.');
  }
  if (targetUser.email && isSuperOwnerIdentityEmail(targetUser.email.toLowerCase())) {
    throw new DomainSecurityError(403, 'SUPER_OWNER_PROTECTED', 'Super Owner account cannot be suspended.');
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ accountStatus: nextStatus, updatedAt: new Date() })
      .where(eq(users.uid, targetUid))
      .returning();

    if (nextStatus !== 'ACTIVE') {
      await tx
        .update(loginSessions)
        .set({ isRevoked: true, revokedReason: 'ADMIN_SUSPENDED_ACCOUNT' })
        .where(eq(loginSessions.userUid, targetUid));
    }

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `USER_STATUS_${nextStatus}`,
      targetEntityType: 'users',
      targetEntityId: targetUid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return updated!;
  });
}

export async function createCoAdminInviteCodeTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  targetEmail: string
): Promise<{ inviteCode: string; expiresAtIso: string }> {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Only the Super Owner can mint Co-Admin invite codes.');
  }
  const cleanEmail = assertCleanText(targetEmail, 'targetEmail', 255, 5).toLowerCase();
  const rawCode = `BSADM-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
  const proofHash = crypto.createHash('sha256').update(`INVITE:${cleanEmail}:${rawCode}`).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);
    await tx.insert(verificationRecords).values({
      verificationType: 'ADMIN_INVITE_LOCK',
      status: 'PENDING',
      proofHash,
      evidenceSummary: cleanEmail,
      reviewedByUid: actor.uid,
      expiresAt,
    });

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'CO_ADMIN_INVITE_MINTED',
      targetEntityType: 'verification_records',
      targetEntityId: proofHash.slice(0, 24),
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });

  return { inviteCode: rawCode, expiresAtIso: expiresAt.toISOString() };
}

export async function claimCoAdminInviteCodeTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  inviteCode: string
) {
  if (!actor.email || !actor.emailVerified) {
    throw new DomainSecurityError(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified email account is required to claim a Co-Admin invite.');
  }
  const cleanEmail = actor.email.trim().toLowerCase();
  const cleanCode = String(inviteCode || '').trim().toUpperCase();
  const proofHash = crypto.createHash('sha256').update(`INVITE:${cleanEmail}:${cleanCode}`).digest('hex');
  const now = new Date();

  return db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);

    const [consumed] = await tx
      .update(verificationRecords)
      .set({
        status: 'CONSUMED',
        subjectUid: actor.uid,
        reviewedAt: now,
      })
      .where(
        and(
          eq(verificationRecords.proofHash, proofHash),
          eq(verificationRecords.verificationType, 'ADMIN_INVITE_LOCK'),
          eq(verificationRecords.status, 'PENDING')
        )
      )
      .returning();

    if (!consumed || (consumed.expiresAt && consumed.expiresAt.getTime() <= now.getTime())) {
      throw new DomainSecurityError(403, 'INVALID_OR_EXPIRED_INVITE', 'Invite code is invalid, expired, or does not match your email.');
    }

    const [granted] = await tx
      .insert(adminRoles)
      .values({
        userUid: actor.uid,
        email: cleanEmail,
        role: 'CO_ADMIN',
        permissionsJson: ['MANAGE_REQUESTS', 'VERIFY_DONORS', 'MANAGE_INVENTORY'],
        isActive: true,
        grantedByUid: consumed.reviewedByUid,
      })
      .onConflictDoUpdate({
        target: adminRoles.userUid,
        set: {
          role: 'CO_ADMIN',
          isActive: true,
          updatedAt: now,
        },
      })
      .returning();

    // Rotate prior sessions so elevated role gets a fresh rotated session
    await tx
      .update(loginSessions)
      .set({ isRevoked: true, revokedReason: 'CO_ADMIN_ROLE_CLAIMED' })
      .where(and(eq(loginSessions.userUid, actor.uid), eq(loginSessions.isRevoked, false)));

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: 'CO_ADMIN',
      action: 'CO_ADMIN_INVITE_CLAIMED',
      targetEntityType: 'admin_roles',
      targetEntityId: actor.uid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });

    return granted!;
  });
}

export async function zeroSlateOperationalResetAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Strictly restricted to Super Owner.');
  }

  return db.transaction(async (tx) => {
    await tx.delete(directMessages);
    await tx.delete(directChatRooms);
    await tx.delete(communityMessages);
    await tx.delete(liveDonorTrips);
    await tx.delete(emergencyAlerts);
    await tx.delete(requestResponses);
    await tx.delete(bloodRequests);
    await tx.delete(contactRequests);
    await tx.delete(reports);
    await tx.delete(gratitudeNotes);

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'ZERO_SLATE_OPERATIONAL_RESET',
      targetEntityType: 'database',
      targetEntityId: 'operational_tables',
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });
}

export async function seedBaselineHospitalsAndInventoryIfEmptyTx(db: BloodSearchDatabase): Promise<void> {
  const [{ cnt }] = await db.select({ cnt: count() }).from(hospitals);
  if (Number(cnt) === 0) {
    await db
      .insert(hospitals)
      .values([
        {
          slug: 'dmch-dhaka',
          nameEn: 'Dhaka Medical College Hospital (DMCH)',
          nameBn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল',
          district: 'Dhaka',
          upazila: 'Shahbagh',
          address: 'Secretariat Rd, Shahbagh, Dhaka 1000',
          latitude: 23.7258,
          longitude: 90.3976,
          emergencyPhone: '+880255165088',
          bloodBankPhone: '+880255165001',
          hospitalType: 'MEDICAL_COLLEGE',
          hasBloodBank: true,
          isVerified: true,
        },
        {
          slug: 'bmum-pg-dhaka',
          nameEn: 'BSMMU (PG Hospital) Transfusion Medicine',
          nameBn: 'বিএসএমএমইউ (পিজি হাসপাতাল)',
          district: 'Dhaka',
          upazila: 'Shahbagh',
          address: 'Kazi Nazrul Islam Ave, Shahbagh, Dhaka',
          latitude: 23.7389,
          longitude: 90.3948,
          emergencyPhone: '+88029661051',
          bloodBankPhone: '+880255165600',
          hospitalType: 'MEDICAL_COLLEGE',
          hasBloodBank: true,
          isVerified: true,
        },
        {
          slug: 'cmch-chattogram',
          nameEn: 'Chattogram Medical College Hospital (CMCH)',
          nameBn: 'চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল',
          district: 'Chattogram',
          upazila: 'Panchlaish',
          address: 'K.B. Fazlul Kader Rd, Chattogram 4203',
          latitude: 22.3593,
          longitude: 91.8308,
          emergencyPhone: '+88031619400',
          bloodBankPhone: '+88031619597',
          hospitalType: 'MEDICAL_COLLEGE',
          hasBloodBank: true,
          isVerified: true,
        },
        {
          slug: 'rmch-rajshahi',
          nameEn: 'Rajshahi Medical College Hospital (RMCH)',
          nameBn: 'রাজশাহী মেডিকেল কলেজ হাসপাতাল',
          district: 'Rajshahi',
          upazila: 'Rajpara',
          address: 'Laxmipur, Rajshahi 6000',
          latitude: 24.372,
          longitude: 88.5866,
          emergencyPhone: '+880721776001',
          bloodBankPhone: '+880721772150',
          hospitalType: 'MEDICAL_COLLEGE',
          hasBloodBank: true,
          isVerified: true,
        },
        {
          slug: 'mag-osmani-sylhet',
          nameEn: 'MAG Osmani Medical College Hospital',
          nameBn: 'এমএজি ওসমানী মেডিকেল কলেজ হাসপাতাল',
          district: 'Sylhet',
          upazila: 'Kotwali',
          address: 'Medical Road, Kajolshah, Sylhet 3100',
          latitude: 24.9012,
          longitude: 91.8544,
          emergencyPhone: '+880821713667',
          bloodBankPhone: '+880821713487',
          hospitalType: 'MEDICAL_COLLEGE',
          hasBloodBank: true,
          isVerified: true,
        },
      ])
      .onConflictDoNothing({ target: hospitals.slug });
  }

  const [{ invCnt }] = await db.select({ invCnt: count() }).from(bloodInventory);
  if (Number(invCnt) === 0) {
    const [centralBank] = await db
      .insert(bloodBanks)
      .values({
        code: 'BD-CENTRAL-RESERVE',
        name: 'BloodSearch Central Transfusion Reserve',
        district: 'Dhaka',
        address: 'Shahbagh Medical Network, Dhaka',
        contactPhone: '16263',
      })
      .onConflictDoUpdate({
        target: bloodBanks.code,
        set: { updatedAt: new Date() },
      })
      .returning();

    if (centralBank) {
      const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
      await db
        .insert(bloodInventory)
        .values(
          groups.map((bg) => ({
            bloodBankId: centralBank.id,
            bloodGroup: bg,
            componentType: 'WHOLE_BLOOD',
            unitsAvailable: 0,
            criticalThreshold: 5,
            stockStatus: 'OUT_OF_STOCK',
          }))
        )
        .onConflictDoNothing();
    }
  }
}

export async function deleteDirectMessageTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  roomId: string,
  messageId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(directChatRooms).where(eq(directChatRooms.id, roomId)).limit(1);
    if (!room) return false;
    if (room.participantOneUid !== actor.uid && room.participantTwoUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only room participants can delete messages.');
    }
    const [msg] = await tx
      .select()
      .from(directMessages)
      .where(and(eq(directMessages.roomId, roomId), sql`${directMessages.id}::text = ${messageId}`))
      .limit(1);
    if (!msg) return false;
    if (msg.senderUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'You can only delete messages sent by you.');
    }
    await tx.delete(directMessages).where(eq(directMessages.id, msg.id));
    return true;
  });
}

export async function deleteDirectChatRoomTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  roomId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(directChatRooms).where(eq(directChatRooms.id, roomId)).limit(1);
    if (!room) return false;
    if (room.participantOneUid !== actor.uid && room.participantTwoUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only room participants can delete this chat room.');
    }
    await tx.delete(directMessages).where(eq(directMessages.roomId, roomId));
    await tx.delete(directChatRooms).where(eq(directChatRooms.id, roomId));
    return true;
  });
}

export async function deleteOwnUserAndDonorAccountTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor
): Promise<void> {
  await db.transaction(async (tx) => {
    const myRooms = await tx
      .select({ id: directChatRooms.id })
      .from(directChatRooms)
      .where(or(eq(directChatRooms.participantOneUid, actor.uid), eq(directChatRooms.participantTwoUid, actor.uid)));
    for (const r of myRooms) {
      await tx.delete(directMessages).where(eq(directMessages.roomId, r.id));
      await tx.delete(directChatRooms).where(eq(directChatRooms.id, r.id));
    }
    await tx.delete(communityMessages).where(eq(communityMessages.senderUid, actor.uid));
    await tx.delete(privateContacts).where(eq(privateContacts.userUid, actor.uid));
    await tx.delete(donorProfiles).where(eq(donorProfiles.userUid, actor.uid));
    await tx.delete(loginSessions).where(eq(loginSessions.userUid, actor.uid));
    await tx.delete(authIdentities).where(eq(authIdentities.userUid, actor.uid));
    await tx.delete(users).where(eq(users.uid, actor.uid));
    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'USER_PROFILE_AND_DONOR_DATA_DELETED',
      targetEntityType: 'users',
      targetEntityId: actor.uid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });
}

export async function adminDeleteUserTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  targetUid: string
): Promise<boolean> {
  if (!isAdminRole(actor.role)) {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
  }
  const [targetUser] = await db
    .select({ uid: users.uid, email: users.email })
    .from(users)
    .where(eq(users.uid, targetUid))
    .limit(1);
  if (!targetUser) return false;
  if (targetUser.email && isSuperOwnerIdentityEmail(targetUser.email.toLowerCase())) {
    throw new DomainSecurityError(403, 'SUPER_OWNER_PROTECTED', 'Super Owner account cannot be deleted.');
  }
  await db.transaction(async (tx) => {
    const myRooms = await tx
      .select({ id: directChatRooms.id })
      .from(directChatRooms)
      .where(or(eq(directChatRooms.participantOneUid, targetUid), eq(directChatRooms.participantTwoUid, targetUid)));
    for (const r of myRooms) {
      await tx.delete(directMessages).where(eq(directMessages.roomId, r.id));
      await tx.delete(directChatRooms).where(eq(directChatRooms.id, r.id));
    }
    await tx.delete(communityMessages).where(eq(communityMessages.senderUid, targetUid));
    await tx.delete(privateContacts).where(eq(privateContacts.userUid, targetUid));
    await tx.delete(donorProfiles).where(eq(donorProfiles.userUid, targetUid));
    await tx.delete(loginSessions).where(eq(loginSessions.userUid, targetUid));
    await tx.delete(authIdentities).where(eq(authIdentities.userUid, targetUid));
    await tx.delete(users).where(eq(users.uid, targetUid));
    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'ADMIN_USER_DELETED',
      targetEntityType: 'users',
      targetEntityId: targetUid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });
  return true;
}

export async function deleteBloodRequestAdminOrOwnerTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  requestId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [reqRow] = await tx
      .select()
      .from(bloodRequests)
      .where(sql`${bloodRequests.id}::text = ${requestId}`)
      .limit(1);
    if (!reqRow) return false;
    if (reqRow.requesterUid !== actor.uid && !isAdminRole(actor.role)) {
      throw new DomainSecurityError(403, 'FORBIDDEN_IDOR', 'Only the request author or Admin can delete this request.');
    }
    await tx.delete(emergencyAlerts).where(eq(emergencyAlerts.requestId, reqRow.id));
    await tx.delete(requestResponses).where(eq(requestResponses.requestId, reqRow.id));
    await tx.delete(liveDonorTrips).where(eq(liveDonorTrips.requestId, reqRow.id));
    await tx.delete(bloodRequests).where(eq(bloodRequests.id, reqRow.id));
    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'BLOOD_REQUEST_DELETED',
      targetEntityType: 'blood_requests',
      targetEntityId: reqRow.id,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
    return true;
  });
}

export async function deleteScamReportAdminTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  reportId: string
): Promise<boolean> {
  if (!isAdminRole(actor.role) && actor.role !== 'MODERATOR') {
    throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin or Moderator role required.');
  }
  await db.delete(reports).where(sql`${reports.id}::text = ${reportId}`);
  await writeAuditLog(db, {
    actorUid: actor.uid,
    actorRole: actor.role,
    action: 'SCAM_REPORT_DELETED',
    targetEntityType: 'reports',
    targetEntityId: reportId,
    outcome: 'SUCCESS',
    ipHash: actor.ipHash,
  });
  return true;
}

export async function listOwnerInviteLocksTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Strictly restricted to Super Owner.');
  }
  const rows = await db
    .select()
    .from(verificationRecords)
    .where(eq(verificationRecords.verificationType, 'ADMIN_INVITE_LOCK'))
    .orderBy(desc(verificationRecords.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    proofHash: r.proofHash,
    label: r.evidenceSummary || 'Admin Invite Code',
    ownerUid: r.reviewedByUid || actor.uid,
    active: r.status === 'PENDING' && (!r.expiresAt || r.expiresAt.getTime() > Date.now()),
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export async function createCustomOwnerInviteLockTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  rawCode: string,
  label: string
): Promise<{ proofHash: string; label: string }> {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Strictly restricted to Super Owner.');
  }
  const normalizedCode = assertCleanText(rawCode, 'rawCode', 64, 6).toUpperCase();
  const cleanLabel = assertCleanText(label || 'District Coordinator Invite', 'label', 120, 2);
  const proofHash = crypto
    .createHash('sha256')
    .update(`BSBD_OWNER_VAULT_V2:${normalizedCode}`)
    .digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);
    await tx.delete(verificationRecords).where(eq(verificationRecords.proofHash, proofHash));
    await tx.insert(verificationRecords).values({
      verificationType: 'ADMIN_INVITE_LOCK',
      status: 'PENDING',
      proofHash,
      evidenceSummary: cleanLabel,
      reviewedByUid: actor.uid,
      expiresAt,
    });
    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: actor.role,
      action: 'OWNER_INVITE_LOCK_CREATED',
      targetEntityType: 'verification_records',
      targetEntityId: proofHash.slice(0, 24),
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });

  return { proofHash, label: cleanLabel };
}

export async function toggleOwnerInviteLockTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  proofHash: string,
  active: boolean,
  label?: string
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Strictly restricted to Super Owner.');
  }
  const cleanHash = assertCleanText(proofHash, 'proofHash', 128, 16);
  await db
    .update(verificationRecords)
    .set({
      status: active ? 'PENDING' : 'REVOKED',
      ...(label ? { evidenceSummary: assertCleanText(label, 'label', 120, 2) } : {}),
    })
    .where(
      and(
        eq(verificationRecords.proofHash, cleanHash),
        eq(verificationRecords.verificationType, 'ADMIN_INVITE_LOCK')
      )
    );
}

export async function deleteOwnerInviteLockTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  proofHash: string
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new DomainSecurityError(403, 'SUPER_ADMIN_REQUIRED', 'Strictly restricted to Super Owner.');
  }
  const cleanHash = assertCleanText(proofHash, 'proofHash', 128, 16);
  await db
    .delete(verificationRecords)
    .where(
      and(
        eq(verificationRecords.proofHash, cleanHash),
        eq(verificationRecords.verificationType, 'ADMIN_INVITE_LOCK')
      )
    );
}

export async function verifyOrClaimOwnerVaultInviteCodeTx(
  db: BloodSearchDatabase,
  actor: ResolvedActor,
  rawCode: string,
  consumeAndGrantRole: boolean
): Promise<{ valid: boolean; proofHash: string }> {
  const normalizedCode = String(rawCode || '').trim().toUpperCase();
  if (normalizedCode.length < 6 || normalizedCode.length > 64) {
    return { valid: false, proofHash: '' };
  }
  const cleanEmail = (actor.email || '').trim().toLowerCase();
  const vaultHash = crypto
    .createHash('sha256')
    .update(`BSBD_OWNER_VAULT_V2:${normalizedCode}`)
    .digest('hex');
  const emailHash = cleanEmail
    ? crypto.createHash('sha256').update(`INVITE:${cleanEmail}:${normalizedCode}`).digest('hex')
    : '';

  const candidateHashes = emailHash ? [vaultHash, emailHash] : [vaultHash];
  const now = new Date();

  const [match] = await db
    .select()
    .from(verificationRecords)
    .where(
      and(
        inArray(verificationRecords.proofHash, candidateHashes),
        eq(verificationRecords.verificationType, 'ADMIN_INVITE_LOCK'),
        eq(verificationRecords.status, 'PENDING')
      )
    )
    .limit(1);

  if (!match || (match.expiresAt && match.expiresAt.getTime() <= now.getTime())) {
    return { valid: false, proofHash: '' };
  }

  if (!consumeAndGrantRole) {
    return { valid: true, proofHash: match.proofHash || '' };
  }

  await db.transaction(async (tx) => {
    await ensureActorUserRowTx(tx, actor);
    await tx
      .update(verificationRecords)
      .set({
        status: 'CONSUMED',
        subjectUid: actor.uid,
        reviewedAt: now,
      })
      .where(eq(verificationRecords.id, match.id));

    await tx
      .insert(adminRoles)
      .values({
        userUid: actor.uid,
        email: cleanEmail || `${actor.uid}@bloodsearch.bd`,
        role: 'CO_ADMIN',
        permissionsJson: ['MANAGE_REQUESTS', 'VERIFY_DONORS', 'MANAGE_INVENTORY'],
        isActive: true,
        grantedByUid: match.reviewedByUid,
      })
      .onConflictDoUpdate({
        target: adminRoles.userUid,
        set: {
          role: 'CO_ADMIN',
          isActive: true,
          updatedAt: now,
        },
      });

    await tx
      .update(loginSessions)
      .set({ isRevoked: true, revokedReason: 'CO_ADMIN_ROLE_CLAIMED' })
      .where(and(eq(loginSessions.userUid, actor.uid), eq(loginSessions.isRevoked, false)));

    await writeAuditLog(tx, {
      actorUid: actor.uid,
      actorRole: 'CO_ADMIN',
      action: 'CO_ADMIN_INVITE_CLAIMED',
      targetEntityType: 'admin_roles',
      targetEntityId: actor.uid,
      outcome: 'SUCCESS',
      ipHash: actor.ipHash,
    });
  });

  return { valid: true, proofHash: match.proofHash || '' };
}

