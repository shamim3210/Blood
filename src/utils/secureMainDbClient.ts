import {
  apiFetch,
  auth,
  getActiveBearerSessionToken,
  getActiveCsrfToken,
} from '../services/bloodSearchService';
import type { BloodGroup, BloodRequest, Donor } from '../types';

export interface ServerAdminVerificationResult {
  ok: boolean;
  isAdmin: boolean;
  role: 'SUPER_ADMIN' | 'CO_ADMIN' | 'MODERATOR' | 'USER';
  lockedOut?: boolean;
  retryAfterSec?: number;
}

let mainServerApiMissing = false;
const optedInContactCache = new Map<
  string,
  {
    expiresAtMs: number;
    value: {
      phone?: string;
      whatsappPhone?: string;
      facebookUrl?: string;
      allowCall?: boolean;
      allowWhatsApp?: boolean;
      allowSms?: boolean;
    } | null;
  }
>();

function isServerBackedOff(): boolean {
  return Date.now() < Number((globalThis as Record<string, unknown>).__bsServerBackoffUntilMs || 0);
}

function triggerServerBackoff(ms = 60_000): void {
  (globalThis as Record<string, unknown>).__bsServerBackoffUntilMs = Date.now() + ms;
}

function buildSessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const bearer = getActiveBearerSessionToken();
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const csrf = getActiveCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

/**
 * Verifies Admin / Super-Owner role strictly against the server-side Neon PostgreSQL RBAC & lockout shield.
 */
export async function verifyAdminWithMainServer(): Promise<ServerAdminVerificationResult> {
  if (mainServerApiMissing || isServerBackedOff() || !auth.currentUser) {
    return { ok: false, isAdmin: false, role: 'USER' };
  }
  try {
    const resp = await apiFetch('/api/v1/auth/admin-verify', {
      method: 'GET',
      headers: buildSessionHeaders(),
    });
    if (resp.status === 404) {
      mainServerApiMissing = true;
      return { ok: false, isAdmin: false, role: 'USER' };
    }
    if (resp.status >= 500) {
      triggerServerBackoff();
      return { ok: false, isAdmin: false, role: 'USER' };
    }
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 429) {
      return {
        ok: false,
        isAdmin: false,
        role: 'USER',
        lockedOut: true,
        retryAfterSec: Number(data?.retryAfterSec) || 900,
      };
    }
    return {
      ok: Boolean(resp.ok && data?.ok),
      isAdmin: Boolean(resp.ok && data?.isAdmin),
      role: (data?.role as ServerAdminVerificationResult['role']) || 'USER',
    };
  } catch {
    return { ok: false, isAdmin: false, role: 'USER' };
  }
}

/**
 * Syncs a registered/updated donor profile + private contact vault to Neon PostgreSQL.
 */
export async function syncDonorProfileToMainDb(payload: {
  displayName: string;
  bloodGroup: BloodGroup;
  age?: number | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  weightKg?: number | null;
  district: string;
  upazila?: string | null;
  area: string;
  latitude?: number | null;
  longitude?: number | null;
  phone: string;
  whatsappNumber?: string | null;
  facebookProfileUrl?: string | null;
  isAvailable?: boolean;
  shareDirectContact?: boolean;
  contactVisibility?:
    | 'PUBLIC_OPT_IN'
    | 'VERIFIED_SEEKERS'
    | 'REQUEST_ONLY'
    | 'EMERGENCY_VERIFIED_ONLY'
    | 'DND_PRIVATE';
  bio?: string | null;
}): Promise<boolean> {
  if (mainServerApiMissing || isServerBackedOff() || !auth.currentUser) return false;
  try {
    const shareDirect = payload.shareDirectContact !== false;
    const normalizedVisibility =
      payload.contactVisibility === 'VERIFIED_SEEKERS'
        ? 'EMERGENCY_VERIFIED_ONLY'
        : payload.contactVisibility || (shareDirect ? 'PUBLIC_OPT_IN' : 'REQUEST_ONLY');
    const resp = await apiFetch('/api/v1/donors/profile', {
      method: 'POST',
      headers: buildSessionHeaders(),
      body: JSON.stringify({
        displayName: payload.displayName,
        bloodGroup: payload.bloodGroup,
        age: payload.age ?? null,
        gender: payload.gender ?? null,
        weightKg: payload.weightKg ?? null,
        district: payload.district,
        upazila: payload.upazila ?? null,
        area: payload.area,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        phone: payload.phone,
        whatsappNumber: payload.whatsappNumber || payload.phone,
        facebookProfileUrl: payload.facebookProfileUrl || null,
        isAvailable: payload.isAvailable !== false,
        shareDirectContact: shareDirect,
        contactPreference: shareDirect ? 'CALL_ALLOWED' : 'IN_APP_ONLY',
        contactVisibility: normalizedVisibility,
        medicalDeclarationAccepted: true,
        bio: payload.bio || null,
      }),
    });
    if (resp.ok && auth.currentUser?.uid) {
      optedInContactCache.delete(auth.currentUser.uid);
    }
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Syncs a new emergency blood request into Neon PostgreSQL when not already persisted.
 */
export async function syncBloodRequestToMainDb(req: BloodRequest): Promise<boolean> {
  if (mainServerApiMissing || !auth.currentUser) return false;
  // Skip duplicate POST if request already has a server UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.id)) {
    return true;
  }
  try {
    const resp = await apiFetch('/api/v1/requests', {
      method: 'POST',
      headers: buildSessionHeaders(),
      body: JSON.stringify({
        patientName: req.patientName,
        bloodGroup: req.bloodGroup,
        bagsNeeded: req.unitsNeeded,
        unitsNeeded: req.unitsNeeded,
        urgency: req.urgency,
        hospitalName: req.hospitalName,
        district: req.district,
        upazila: req.upazila || null,
        area: req.upazila || req.district,
        contactName: req.contactName || req.patientName,
        contactPhone: req.contactPhone,
        whatsappNumber: req.contactPhone,
        shareDirectContact: req.seekerSharePhone !== false,
        clinicalReason: req.reason || null,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches public donors from Neon PostgreSQL (`/api/v1/donors/search`) without raw PII dumps.
 */
export async function fetchDonorsFromMainDb(): Promise<Donor[]> {
  if (mainServerApiMissing || isServerBackedOff()) return [];
  try {
    const resp = await apiFetch('/api/v1/donors/search?availableOnly=false&limit=50', {
      method: 'GET',
    });
    if (resp.status === 404) {
      mainServerApiMissing = true;
      return [];
    }
    if (resp.status >= 500) {
      triggerServerBackoff();
      return [];
    }
    if (!resp.ok) return [];
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('json')) {
      mainServerApiMissing = true;
      return [];
    }
    const data = await resp.json();
    if (!data?.ok || !Array.isArray(data.items)) return [];

    return data.items.map(
      (row: Record<string, unknown>): Donor => ({
        id: String(row.userUid || row.id),
        name: String(row.publicName || 'Donor'),
        bloodGroup: (row.bloodGroup as BloodGroup) || 'O+',
        division: 'dhaka',
        district: String(row.district || 'dhaka').toLowerCase(),
        upazila: String(row.area || row.upazila || row.district || 'Dhaka'),
        phone: String(row.maskedPhoneHint || '017****00'),
        available: Boolean(row.isAvailable),
        availabilityStatus:
          row.availabilityStatus === 'DND'
            ? 'DND'
            : row.isAvailable === false
              ? 'TEMPORARILY_UNAVAILABLE'
              : 'AVAILABLE',
        availabilityConfirmedAtMs: row.lastAvailabilityConfirmedAt
          ? new Date(String(row.lastAvailabilityConfirmedAt)).getTime()
          : undefined,
        shareDirectContact: row.shareDirectContact !== false,
        contactVisibility: row.shareDirectContact === false ? 'REQUEST_ONLY' : 'PUBLIC_OPT_IN',
        allowCall: row.contactPreference !== 'WHATSAPP_ONLY' && row.contactPreference !== 'IN_APP_ONLY',
        allowWhatsApp: row.contactPreference !== 'IN_APP_ONLY',
        allowSms: row.contactPreference !== 'WHATSAPP_ONLY' && row.contactPreference !== 'IN_APP_ONLY',
        isCloudRecord: true,
        lastDonatedDate: '',
        totalDonations: Number(row.totalDonations) || 0,
        verifiedBadge: Boolean(row.isVerified),
        rating: Number(row.rating) || 5.0,
        reviewsCount: 0,
        age: Number(row.age) || 0,
        gender:
          row.gender === 'FEMALE' ? 'FEMALE' : row.gender === 'OTHER' ? 'OTHER' : 'MALE',
        weightKg: 0,
      })
    );
  } catch {
    return [];
  }
}

/**
 * Resolves single-donor opted-in Call, WhatsApp, SMS, and Facebook details from Neon PostgreSQL
 * with a 60-second client cache to avoid redundant network hits when clicking contact buttons.
 */
export async function resolveOptedInDonorContactFromMainDb(donorUid: string): Promise<{
  phone?: string;
  whatsappPhone?: string;
  facebookUrl?: string;
  allowCall?: boolean;
  allowWhatsApp?: boolean;
  allowSms?: boolean;
} | null> {
  if (!donorUid || mainServerApiMissing || isServerBackedOff()) return null;

  const cacheKey = `${auth.currentUser?.uid || 'guest'}:${donorUid}`;
  const cached = optedInContactCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.value;
  }

  try {
    const url = auth.currentUser
      ? `/api/v1/donors/${encodeURIComponent(donorUid)}/contact?silent=1`
      : `/api/v1/donors/${encodeURIComponent(donorUid)}/opted-in-contact?silent=1`;

    const resp = await apiFetch(url, {
      method: 'GET',
      headers: buildSessionHeaders(),
    });
    if (resp.status >= 500) {
      triggerServerBackoff();
      return null;
    }
    if (!resp.ok) {
      optedInContactCache.set(cacheKey, { expiresAtMs: Date.now() + 30_000, value: null });
      return null;
    }
    const data = await resp.json();
    const c = data?.contact;
    if (!c) {
      optedInContactCache.set(cacheKey, { expiresAtMs: Date.now() + 30_000, value: null });
      return null;
    }
    const resolved = {
      phone: c.phoneE164 || undefined,
      whatsappPhone: c.whatsappNumber || c.phoneE164 || undefined,
      facebookUrl: c.facebookProfileUrl || undefined,
      allowCall: c.allowCall !== false,
      allowWhatsApp: c.allowWhatsApp !== false,
      allowSms: c.allowSms !== false,
    };
    optedInContactCache.set(cacheKey, { expiresAtMs: Date.now() + 60_000, value: resolved });
    return resolved;
  } catch {
    return null;
  }
}
