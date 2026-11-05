import { AuditLogEntry, BloodRequest, Donor } from '../types';

/**
 * 100% Clean-Slate Production Mode:
 * Zero pre-seeded donors, zero pre-seeded requests, zero fake audit logs.
 * Only real accounts and requests created by users exist in the app & database.
 */
export const INITIAL_DONORS: Donor[] = [];

export const INITIAL_REQUESTS: BloodRequest[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];

export const LEGACY_FAKE_DONOR_IDS: ReadonlySet<string> = new Set([
  'donor-1',
  'donor-2',
  'donor-3',
  'donor-4',
  'donor-5',
  'donor-6',
  'donor-7',
  'donor-8',
  'donor-9',
  'donor-10',
  'seed-map-donor-1',
  'seed-map-donor-2',
  'seed-map-donor-3',
  'seed-map-donor-4',
  'bd_member_niketon_01',
  'bd_member_dhanmondi_02',
  'bd_member_mirpur_03',
  'bd_member_uttara_04',
  'bd_member_gulshan_05',
  'bd_member_ctg_06',
  'bd_member_sylhet_07',
]);

export const LEGACY_FAKE_REQUEST_IDS: ReadonlySet<string> = new Set([
  'req-1',
  'req-2',
  'req-3',
  'req-4',
  'seed-map-sos-1',
  'seed-map-sos-2',
  'sos_test_100',
  'bd_req_labaid_01',
  'bd_req_square_02',
]);

export const LEGACY_FAKE_AUDIT_IDS: ReadonlySet<string> = new Set([
  'audit-1',
  'audit-2',
  'audit-3',
]);

export const LEGACY_FAKE_NAMES: ReadonlySet<string> = new Set([
  'tanvir',
  'tanvir ahmed',
  'তানভীর',
  'তানভীর আহমেদ',
  'তানভীর আহমেদ (tanvir ahmed)',
  'ফারহানা হক (farhana haque)',
  'রাকিব হাসান (rakib hasan)',
  'সাদিয়া ইসলাম (sadia islam)',
  'মোস্তাফিজুর রহমান (mostafizur rahman)',
  'নাসরিন আক্তার (nasrin akhter)',
  'আরিফুল হক (ariful haque)',
  'মাহমুদুল হাসান (mahmudul hasan)',
  'সুমাইয়া জাহান (sumaiya jahan)',
  'জাহিদুল ইসলাম (zahidul islam)',
  'সুলতানা পারভীন (sultana parveen)',
  'মোহাম্মদ রফিক (md. rafiq)',
  'আফসানা রহমান (afsana rahman)',
  'আব্দুল কাদের (abdul kader)',
  'dr. nusrat tazin',
  'nusrat tazin',
  'ডা. নুসরাত তাজিন',
  'tasnim ferdousi',
  'তাসনিম ফেরদৌসী',
  'dr. mahbub alam',
  'mahbub alam',
  'kamrul hasan',
  'sabbir hossain',
  'farzana yasmin',
  'tareq rahman',
]);

export const SEED_DONOR_IDS: ReadonlySet<string> = LEGACY_FAKE_DONOR_IDS;
export const SEED_REQUEST_IDS: ReadonlySet<string> = LEGACY_FAKE_REQUEST_IDS;
export const SEED_AUDIT_IDS: ReadonlySet<string> = LEGACY_FAKE_AUDIT_IDS;

export function isFakeIdentifier(id?: string): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (
    LEGACY_FAKE_DONOR_IDS.has(trimmed) ||
    LEGACY_FAKE_REQUEST_IDS.has(trimmed) ||
    LEGACY_FAKE_AUDIT_IDS.has(trimmed)
  ) {
    return true;
  }
  return /^(donor-\d+|req-\d+|audit-\d+|d\d+|bd_member_|bd_req_|seed[_-]|demo[_-]|fake[_-]|mock[_-]|sample[_-]|sos_test_)/i.test(
    trimmed
  );
}

export function isFakePersonName(name?: string): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  if (LEGACY_FAKE_NAMES.has(lower)) return true;
  return /^(fake\b|demo\b|test user\b|test donor\b|dummy\b|sample\b)/i.test(lower);
}

export function isSeedDonorId(id?: string): boolean {
  return isFakeIdentifier(id);
}

export function isSeedRequestId(id?: string): boolean {
  return isFakeIdentifier(id);
}

export function isSeedAuditId(id?: string): boolean {
  return isFakeIdentifier(id);
}

export function isRealOnlyModeEnabled(): boolean {
  return true;
}

function hasInvalidLocalRequestPhone(rawPhone?: string): boolean {
  if (!rawPhone) return false;
  const trimmed = String(rawPhone).trim();
  if (trimmed === 'হাসপাতাল জরুরি কাউন্টার' || trimmed === 'Hospital Emergency Desk') {
    return false;
  }
  const ascii = trimmed.replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  const digits = ascii.replace(/\D/g, '');
  if (digits.length === 11 && /^01[3-9]\d{8}$/.test(digits)) {
    return (
      digits === '01700000000' ||
      digits === '01711000000' ||
      digits === '01700000001' ||
      /^01[3-9](\d)\1{7}$/.test(digits)
    );
  }
  if (digits.length === 13 && /^8801[3-9]\d{8}$/.test(digits)) {
    const local11 = digits.slice(2);
    return (
      local11 === '01700000000' ||
      local11 === '01711000000' ||
      local11 === '01700000001' ||
      /^01[3-9](\d)\1{7}$/.test(local11)
    );
  }
  return true;
}

/**
 * Scrubs all legacy seed/test/cached records in browser localStorage on boot
 * and enforces the one-time v6 zero-slate reset so only fresh accounts appear.
 */
export function scrubFakeLocalStorageOnBoot(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('bloodsearch_zero_slate_v6') !== 'done') {
      localStorage.removeItem('bloodsearch_current_user');
      localStorage.removeItem('bloodsearch_pending_profile_draft');
      localStorage.removeItem('bloodsearch_donors');
      localStorage.removeItem('bloodsearch_requests');
      localStorage.removeItem('bloodsearch_audit_logs');
      localStorage.removeItem('bloodsearch_live_donor_trips');
      localStorage.removeItem('bloodsearch_saved_community_chat_v1');
      localStorage.removeItem('bloodsearch_saved_direct_chat_v1');
      localStorage.removeItem('bloodsearch_donation_logs_v1');
      localStorage.removeItem('bloodsearch_verified_cloud_seeded_v4');
      localStorage.removeItem('bloodsearch_clean_cloud_rebuild_v5');
      localStorage.setItem('bloodsearch_zero_slate_v6', 'done');
    }

    // One-time v7 Chat Zero-Slate Reset: wipe all cached local & WhatsApp-synced chat history
    if (localStorage.getItem('bloodsearch_chat_zero_slate_v7') !== 'done') {
      localStorage.removeItem('bloodsearch_saved_community_chat_v1');
      localStorage.removeItem('bloodsearch_saved_direct_chat_v1');
      localStorage.setItem('bloodsearch_chat_zero_slate_v7', 'done');
    }

    // One-time v8 Zero-Unique-Seed Scrub: purge any legacy seed family or thalassemia items
    if (localStorage.getItem('bloodsearch_zero_unique_v8') !== 'done') {
      try {
        const rawFam = localStorage.getItem('bloodsearch_family_members');
        if (rawFam) {
          const parsedFam = JSON.parse(rawFam);
          if (Array.isArray(parsedFam)) {
            const cleanFam = parsedFam.filter(
              (m) => m && typeof m.id === 'string' && !/^fam-[1-4]$/.test(m.id)
            );
            localStorage.setItem('bloodsearch_family_members', JSON.stringify(cleanFam));
          }
        }
        const rawThal = localStorage.getItem('bloodsearch_thalassemia_patients');
        if (rawThal) {
          const parsedThal = JSON.parse(rawThal);
          if (Array.isArray(parsedThal)) {
            const cleanThal = parsedThal.filter(
              (p) => p && typeof p.id === 'string' && !/^th-[1-2]$/.test(p.id)
            );
            localStorage.setItem('bloodsearch_thalassemia_patients', JSON.stringify(cleanThal));
          }
        }
      } catch {}
      localStorage.setItem('bloodsearch_zero_unique_v8', 'done');
    }

    const rawDonors = localStorage.getItem('bloodsearch_donors');
    if (rawDonors) {
      const parsed = JSON.parse(rawDonors);
      if (Array.isArray(parsed)) {
        const cleanDonors = parsed.filter(
          (d) => d && typeof d.id === 'string' && !isFakeIdentifier(d.id) && !isFakePersonName(d.name)
        );
        localStorage.setItem('bloodsearch_donors', JSON.stringify(cleanDonors));
      }
    }

    const rawRequests = localStorage.getItem('bloodsearch_requests');
    if (rawRequests) {
      const parsed = JSON.parse(rawRequests);
      if (Array.isArray(parsed)) {
        const seenKeys = new Set<string>();
        const cleanReqs = parsed.filter((r) => {
          if (
            !r ||
            typeof r.id !== 'string' ||
            isFakeIdentifier(r.id) ||
            isFakePersonName(r.patientName) ||
            hasInvalidLocalRequestPhone(r.contactPhone)
          ) {
            return false;
          }
          const sig =
            r.status === 'ACTIVE'
              ? `${String(r.patientName || '').trim().toLowerCase()}|${String(r.hospitalName || '').trim().toLowerCase()}|${String(r.bloodGroup || '')}`
              : r.id;
          if (seenKeys.has(sig)) return false;
          seenKeys.add(sig);
          return true;
        });
        localStorage.setItem('bloodsearch_requests', JSON.stringify(cleanReqs));
      }
    }

    const rawUser = localStorage.getItem('bloodsearch_current_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && (isFakeIdentifier(u.id) || isFakePersonName(u.name))) {
        localStorage.removeItem('bloodsearch_current_user');
      }
    }
  } catch {
    // Ignore malformed local cache
  }
}

export function evictSeedsProgressively<
  T extends {
    id: string;
    name?: string;
    patientName?: string;
    hospitalName?: string;
    bloodGroup?: string;
    status?: string;
    contactPhone?: string;
  },
>(realItems: T[], _seedItems: T[] = [], _forceRealOnly = true): T[] {
  const seen = new Set<string>();
  const seenActiveReqSig = new Set<string>();
  const combined: T[] = [];

  for (const item of realItems) {
    if (
      item &&
      item.id &&
      !seen.has(item.id) &&
      !isFakeIdentifier(item.id) &&
      !isFakePersonName(item.name || item.patientName)
    ) {
      if (item.patientName && hasInvalidLocalRequestPhone(item.contactPhone)) {
        continue;
      }
      if (item.patientName && item.status === 'ACTIVE') {
        const sig = `${item.patientName.trim().toLowerCase()}|${String(item.hospitalName || '').trim().toLowerCase()}|${String(item.bloodGroup || '')}`;
        if (seenActiveReqSig.has(sig)) {
          continue;
        }
        seenActiveReqSig.add(sig);
      }
      seen.add(item.id);
      combined.push(item);
    }
  }

  return combined;
}
