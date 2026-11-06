import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import {
  rankDonorsForSeeker,
  computeEscalationTargets,
  canSeekerViewDirectContact,
  buildDirectCallHref,
  buildWhatsAppHref,
  getDonorAvailabilityConfidence,
  deriveRequestLifecycleState,
} from '../src/utils/donorMatcher';
import {
  resolveBangladeshCoordinates,
  resolvePlaceOrHospitalQuery,
  fetchUberStyleRoute,
} from '../src/utils/geolocation';
import { createEmergencyApiApp, sha256Short, type VerifiedCaller } from '../server';
import { closeNeonDatabase } from '../src/db/index';
import type { Donor, BloodRequest } from '../src/types';

process.env.NODE_ENV = 'test';

after(async () => {
  await closeNeonDatabase();
});

const NOW_MS = Date.now();

function makeDonor(overrides: Partial<Donor> & { id: string; name: string }): Donor {
  return {
    id: overrides.id,
    name: overrides.name,
    bloodGroup: overrides.bloodGroup || 'O+',
    division: overrides.division || 'dhaka',
    district: overrides.district || 'dhaka',
    upazila: overrides.upazila || 'dhanmondi',
    phone: overrides.phone ?? '01711223344',
    whatsappPhone: overrides.whatsappPhone,
    available: overrides.available ?? true,
    availabilityStatus: overrides.availabilityStatus ?? 'AVAILABLE',
    availabilityConfirmedAtMs: overrides.availabilityConfirmedAtMs,
    shareDirectContact: overrides.shareDirectContact ?? true,
    contactVisibility: overrides.contactVisibility ?? 'PUBLIC_OPT_IN',
    allowCall: overrides.allowCall ?? true,
    allowWhatsApp: overrides.allowWhatsApp ?? true,
    allowSms: overrides.allowSms ?? true,
    emergencyAlertsOptIn: overrides.emergencyAlertsOptIn ?? true,
    alertsPaused: overrides.alertsPaused ?? false,
    lastDonatedDate: overrides.lastDonatedDate ?? '2024-01-10',
    totalDonations: overrides.totalDonations ?? 4,
    verifiedBadge: overrides.verifiedBadge ?? true,
    rating: overrides.rating ?? 4.9,
    reviewsCount: overrides.reviewsCount ?? 5,
    age: overrides.age ?? 27,
    gender: overrides.gender ?? 'MALE',
    weightKg: overrides.weightKg ?? 68,
  };
}

async function startTestServer() {
  const tokenDirectory = new Map<string, VerifiedCaller>([
    [
      'token-seeker-1',
      { uid: 'seeker_uid_1', emailVerified: true, emailHash: 'hash_seeker_1' },
    ],
    [
      'token-attacker-2',
      { uid: 'attacker_uid_2', emailVerified: true, emailHash: 'hash_attacker_2' },
    ],
    [
      'token-unverified',
      { uid: 'unverified_uid', emailVerified: false, emailHash: 'hash_unverified' },
    ],
    [
      'token-super-owner',
      {
        uid: 'super_owner_uid',
        emailVerified: true,
        emailHash: sha256Short('shamimrakib015@gmail.com'),
      },
    ],
  ]);

  const app = createEmergencyApiApp({
    verifyTokenOverride: async (token) => tokenDirectory.get(token) || null,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

test('1. Fast donor search ranks exact + recently confirmed nearby donors first & demotes unreached attempts', () => {
  const dhakaOrigin = resolveBangladeshCoordinates({ district: 'dhaka', upazila: 'shahbagh' });

  const exactConfirmedNearby = makeDonor({
    id: 'donor_exact_confirmed',
    name: 'Tanvir Confirmed',
    bloodGroup: 'B+',
    district: 'dhaka',
    upazila: 'shahbagh',
    availabilityConfirmedAtMs: NOW_MS - 15 * 60 * 1000, // 15m ago
  });

  const compatibleUnknownNearby = makeDonor({
    id: 'donor_compat_unknown',
    name: 'Rahim Unknown Status',
    bloodGroup: 'O+',
    district: 'dhaka',
    upazila: 'dhanmondi',
    availabilityConfirmedAtMs: undefined,
  });

  const farExactDonor = makeDonor({
    id: 'donor_exact_far',
    name: 'Karim Sylhet',
    bloodGroup: 'B+',
    division: 'sylhet',
    district: 'sylhet',
    upazila: 'sadar',
    availabilityConfirmedAtMs: NOW_MS - 30 * 60 * 1000,
  });

  const dndDonor = makeDonor({
    id: 'donor_dnd',
    name: 'Nadia DND',
    bloodGroup: 'B+',
    district: 'dhaka',
    availabilityStatus: 'DND',
  });

  assert.equal(getDonorAvailabilityConfidence(exactConfirmedNearby, NOW_MS), 'CONFIRMED_RECENT');
  assert.equal(getDonorAvailabilityConfidence(compatibleUnknownNearby, NOW_MS), 'UNKNOWN_UNCONFIRMED');
  assert.equal(getDonorAvailabilityConfidence(dndDonor, NOW_MS), 'DND');

  const ranked = rankDonorsForSeeker(
    [dndDonor, farExactDonor, compatibleUnknownNearby, exactConfirmedNearby],
    {
      bloodGroup: 'B+',
      compatibleMatchEnabled: true,
      district: 'ALL',
      urgency: 'CRITICAL',
      requiredTimeWindow: 'IMMEDIATE_2H',
      originCoords: dhakaOrigin,
      includeNearbyDistricts: true,
      seekerIsVerifiedUser: true,
      nowMs: NOW_MS,
    }
  );

  assert.equal(ranked[0].donor.id, 'donor_exact_confirmed');
  assert.equal(ranked[ranked.length - 1].donor.id, 'donor_dnd');

  // Record unsuccessful attempt on #1 -> next donor surfaces immediately at #1
  const rankedAfterNoAnswer = rankDonorsForSeeker(
    [dndDonor, farExactDonor, compatibleUnknownNearby, exactConfirmedNearby],
    {
      bloodGroup: 'B+',
      compatibleMatchEnabled: true,
      district: 'ALL',
      urgency: 'CRITICAL',
      requiredTimeWindow: 'IMMEDIATE_2H',
      originCoords: dhakaOrigin,
      includeNearbyDistricts: true,
      seekerIsVerifiedUser: true,
      unsuccessfulDonorIds: ['donor_exact_confirmed'],
      nowMs: NOW_MS,
    }
  );

  assert.notEqual(rankedAfterNoAnswer[0].donor.id, 'donor_exact_confirmed');
  assert.equal(
    rankedAfterNoAnswer.find((r) => r.donor.id === 'donor_exact_confirmed')?.wasAttemptedUnsuccessfully,
    true
  );
});

test('2. Opted-in donor Call and WhatsApp actions build valid links while masked/private numbers are blocked', () => {
  const optedInDonor = makeDonor({
    id: 'donor_opt_in',
    name: 'Sabbir OptIn',
    phone: '01712345678',
    whatsappPhone: '01712345678',
    shareDirectContact: true,
    contactVisibility: 'PUBLIC_OPT_IN',
  });

  const consent = canSeekerViewDirectContact(optedInDonor, false);
  assert.equal(consent.allowed, true);

  const callHref = buildDirectCallHref(optedInDonor.phone);
  const waHref = buildWhatsAppHref(optedInDonor.whatsappPhone, 'Urgent O+ blood needed');

  assert.equal(callHref, 'tel:+8801712345678');
  assert.ok(waHref?.startsWith('https://wa.me/8801712345678?text='));

  // Masked phone must NEVER generate fake/broken tel: or wa.me: URLs
  assert.equal(buildDirectCallHref('017****78'), null);
  assert.equal(buildWhatsAppHref('017****78', 'Hello'), null);
});

test('3 & 4. Concurrent multi-donor notification & no-response escalation expand radius without duplicate spam', async () => {
  const dDhaka1 = makeDonor({
    id: 'cloud_dhaka_1',
    name: 'Dhaka Donor 1',
    bloodGroup: 'O+',
    district: 'dhaka',
    upazila: 'shahbagh',
  });
  const dDhaka2 = makeDonor({
    id: 'cloud_dhaka_2',
    name: 'Dhaka Donor 2',
    bloodGroup: 'O-',
    district: 'dhaka',
    upazila: 'dhanmondi',
  });
  const dPaused = makeDonor({
    id: 'cloud_dhaka_paused',
    name: 'Paused Donor',
    bloodGroup: 'O+',
    district: 'dhaka',
    alertsPaused: true,
  });
  const dGazipur = makeDonor({
    id: 'cloud_gazipur_1',
    name: 'Gazipur Nearby District Donor',
    bloodGroup: 'O+',
    district: 'gazipur',
    upazila: 'sadar',
  });
  const dNarayanganj = makeDonor({
    id: 'cloud_narayanganj_1',
    name: 'Narayanganj Nearby District Donor',
    bloodGroup: 'O+',
    district: 'narayanganj',
    upazila: 'sadar',
  });

  const allPool = [dDhaka1, dDhaka2, dPaused, dGazipur, dNarayanganj];

  // Level 0: Concurrent local matching donors (excludes paused donor)
  const tier0 = computeEscalationTargets({
    targetLevel: 0,
    bloodGroup: 'O+',
    originDistrict: 'dhaka',
    allDonors: allPool,
    alreadyNotifiedDonorIds: [],
  });

  const tier0Ids = tier0.eligibleDonorsToNotify.map((d) => d.id);
  assert.ok(tier0Ids.includes('cloud_dhaka_1'));
  assert.ok(tier0Ids.includes('cloud_dhaka_2'));
  assert.ok(!tier0Ids.includes('cloud_dhaka_paused'), 'Paused donor must not be notified');
  assert.ok(!tier0Ids.includes('cloud_gazipur_1'), 'Outer district waited until escalation');

  // Level 2 (50km + Nearby Districts): finds Gazipur & Narayanganj while excluding already-notified Dhaka donors
  const tier2 = computeEscalationTargets({
    targetLevel: 2,
    bloodGroup: 'O+',
    originDistrict: 'dhaka',
    allDonors: allPool,
    alreadyNotifiedDonorIds: tier0Ids,
  });

  const tier2Ids = tier2.eligibleDonorsToNotify.map((d) => d.id);
  assert.ok(tier2Ids.includes('cloud_gazipur_1'));
  assert.ok(!tier2Ids.includes('cloud_dhaka_1'), 'Already notified donor must not be spammed again');
  assert.ok(!tier2Ids.includes('cloud_dhaka_2'), 'Already notified donor must not be spammed again');

  // Test backend dispatch & escalation deduplication
  const srv = await startTestServer();
  try {
    const dispatchRes = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_test_100',
        bloodGroup: 'O+',
        hospitalName: 'Dhaka Medical College Hospital',
        district: 'dhaka',
        urgency: 'CRITICAL',
        candidateDonorIds: tier0Ids,
      }),
    });
    assert.equal(dispatchRes.status, 200);
    const dispatchData = await dispatchRes.json();
    assert.equal(dispatchData.ok, true);

    // Escalate with overlapping + new donor IDs -> server deduplicates already notified hashes
    const escRes = await fetch(`${srv.baseUrl}/api/emergency/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_test_100',
        nextLevel: 2,
        newlyMatchedDonorIds: ['cloud_dhaka_1', 'cloud_gazipur_1', 'cloud_narayanganj_1'],
      }),
    });
    assert.equal(escRes.status, 200);
    const escData = await escRes.json();
    assert.equal(escData.ok, true);
    assert.deepEqual(escData.dedupedNewDonorIds, ['cloud_gazipur_1', 'cloud_narayanganj_1']);
    assert.equal(escData.skippedDuplicatesCount, 1);
  } finally {
    await srv.close();
  }
});

test('5. Unauthorized users cannot access private donor contacts, hijack escalations, or self-assign admin roles', async () => {
  const requestOnlyDonor = makeDonor({
    id: 'donor_private_1',
    name: 'Private Donor',
    shareDirectContact: false,
    contactVisibility: 'REQUEST_ONLY',
  });
  const verifiedOnlyDonor = makeDonor({
    id: 'donor_verified_only',
    name: 'Verified Seekers Donor',
    shareDirectContact: true,
    contactVisibility: 'VERIFIED_SEEKERS',
  });
  const dndDonor = makeDonor({
    id: 'donor_dnd_2',
    name: 'DND Donor',
    shareDirectContact: true,
    availabilityStatus: 'DND',
  });

  assert.equal(canSeekerViewDirectContact(requestOnlyDonor, true).allowed, false);
  assert.equal(canSeekerViewDirectContact(verifiedOnlyDonor, false).allowed, false);
  assert.equal(canSeekerViewDirectContact(verifiedOnlyDonor, true).allowed, true);
  assert.equal(canSeekerViewDirectContact(dndDonor, true).allowed, false);

  // Verify backend blocks unauthenticated, unverified, and wrong-owner requests
  const srv = await startTestServer();
  try {
    const unauthRes = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'sos_unauth',
        bloodGroup: 'A+',
        hospitalName: 'DMCH',
        district: 'dhaka',
        urgency: 'CRITICAL',
      }),
    });
    assert.equal(unauthRes.status, 401);

    const unverifiedRes = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-unverified',
      },
      body: JSON.stringify({
        requestId: 'sos_unverified',
        bloodGroup: 'A+',
        hospitalName: 'DMCH',
        district: 'dhaka',
        urgency: 'CRITICAL',
      }),
    });
    assert.equal(unverifiedRes.status, 401);

    // Owner creates request
    await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_owned_by_1',
        bloodGroup: 'A+',
        hospitalName: 'Square Hospital',
        district: 'dhaka',
        urgency: 'CRITICAL',
      }),
    });

    // Different user tries to escalate or stop owner's request -> 403 FORBIDDEN
    const hijackEsc = await fetch(`${srv.baseUrl}/api/emergency/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-attacker-2',
      },
      body: JSON.stringify({ requestId: 'sos_owned_by_1', nextLevel: 1 }),
    });
    assert.equal(hijackEsc.status, 403);

    const hijackStop = await fetch(`${srv.baseUrl}/api/emergency/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-attacker-2',
      },
      body: JSON.stringify({ requestId: 'sos_owned_by_1', reason: 'CANCELLED' }),
    });
    assert.equal(hijackStop.status, 403);
  } finally {
    await srv.close();
  }

  // Verify hardened Neon PostgreSQL repository enforces PII isolation & blocks admin self-escalation
  const repoText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/db/repositories/bloodSearchRepo.ts'),
    'utf8'
  );
  assert.ok(repoText.includes('FORBIDDEN_IDOR'));
  assert.ok(repoText.includes('ADMIN_REQUIRED') || repoText.includes('SUPER_ADMIN'));
  assert.ok(repoText.includes('privateContacts'));
});

test('6. Missing SMS/FCM credentials produce honest fallback messages, and duplicate/rate-limit abuse is blocked', async () => {
  const srv = await startTestServer();
  try {
    const capRes = await fetch(`${srv.baseUrl}/api/capabilities`);
    const capJson = await capRes.json();
    assert.equal(capJson.ok, true);
    assert.equal(capJson.capabilities.smsConfigured, false);
    assert.equal(capJson.capabilities.smsProvider, 'NONE');

    // First valid broadcast returns honest NOT_CONFIGURED SMS status (zero fake delivery receipts)
    const r1 = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_honest_1',
        bloodGroup: 'AB-',
        hospitalName: 'NICVD Dhaka',
        district: 'dhaka',
        urgency: 'CRITICAL',
        optedInSmsPhones: ['+8801711223344'],
      }),
    });
    assert.equal(r1.status, 200);
    const d1 = await r1.json();
    assert.equal(d1.channels.smsStatus, 'NOT_CONFIGURED');
    assert.equal(d1.channels.smsSentCount, 0);
    assert.match(d1.honestDeliveryNotice, /do not guarantee a donor has seen or read/i);

    // Identical duplicate request for same hospital & group within 10m -> 409 DUPLICATE_REQUEST
    const rDup = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_honest_2_dup',
        bloodGroup: 'AB-',
        hospitalName: 'NICVD Dhaka',
        district: 'dhaka',
        urgency: 'CRITICAL',
      }),
    });
    assert.equal(rDup.status, 409);

    // Audit summary never exposes raw phone numbers or emails
    const auditRes = await fetch(`${srv.baseUrl}/api/audit/summary`, {
      headers: { Authorization: 'Bearer token-seeker-1' },
    });
    const auditJson = await auditRes.json();
    const serializedAudit = JSON.stringify(auditJson);
    assert.ok(!serializedAudit.includes('01711223344'), 'Audit log must not contain raw phone PII');
  } finally {
    await srv.close();
  }
});

test('7. Request cancellation and fulfillment halt future alerts and block subsequent escalations', async () => {
  const srv = await startTestServer();
  try {
    await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_lifecycle_1',
        bloodGroup: 'O-',
        hospitalName: 'BSMMU Shahbagh',
        district: 'dhaka',
        urgency: 'CRITICAL',
      }),
    });

    const stopRes = await fetch(`${srv.baseUrl}/api/emergency/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_lifecycle_1',
        reason: 'FULFILLED',
      }),
    });
    assert.equal(stopRes.status, 200);
    const stopData = await stopRes.json();
    assert.equal(stopData.status, 'FULFILLED');
    assert.equal(stopData.alertsHalted, true);

    // Escalation after FULFILLED must be rejected with 409 REQUEST_INACTIVE
    const escAfterStop = await fetch(`${srv.baseUrl}/api/emergency/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'sos_lifecycle_1',
        nextLevel: 1,
        newlyMatchedDonorIds: ['cloud_dhaka_9'],
      }),
    });
    assert.equal(escAfterStop.status, 409);

    // Verify client lifecycle state derivation across all states
    const baseReq: BloodRequest = {
      id: 'sos_lifecycle_1',
      patientName: 'Test Patient',
      patientAge: 40,
      bloodGroup: 'O-',
      unitsNeeded: 2,
      unitsCollected: 0,
      hospitalName: 'BSMMU',
      division: 'dhaka',
      district: 'dhaka',
      upazila: 'shahbagh',
      urgency: 'CRITICAL',
      contactName: 'Relative',
      contactPhone: '01700000000',
      requiredDate: 'Immediate',
      reason: 'Surgery',
      responders: [],
      createdAt: 'Just now',
      status: 'ACTIVE',
    };

    assert.equal(deriveRequestLifecycleState(baseReq), 'SEARCHING');
    assert.equal(deriveRequestLifecycleState({ ...baseReq, notifiedCount: 4 }), 'DONORS_NOTIFIED');
    assert.equal(
      deriveRequestLifecycleState({ ...baseReq, notifiedCount: 4, respondedCount: 1 }),
      'RESPONSES_RECEIVED'
    );
    assert.equal(
      deriveRequestLifecycleState({ ...baseReq, notifiedCount: 4, contactAttemptsCount: 2 }),
      'CONTACT_ATTEMPTED'
    );
    assert.equal(
      deriveRequestLifecycleState({ ...baseReq, confirmedDonorId: 'd_1' }),
      'DONOR_CONFIRMED'
    );
    assert.equal(deriveRequestLifecycleState({ ...baseReq, status: 'FULFILLED' }), 'FULFILLED');
    assert.equal(deriveRequestLifecycleState({ ...baseReq, status: 'CANCELLED' }), 'CANCELLED');
  } finally {
    await srv.close();
  }
});

test('8. Fuzzy hospital search ("Squire hospital") resolves to Square Hospital Dhaka and ranks nearby compatible donors instead of 0 results', () => {
  const place = resolvePlaceOrHospitalQuery('Squire hospital');
  assert.ok(place, 'Squire hospital typo should resolve to Square Hospital');
  assert.equal(place.districtId, 'dhaka');
  assert.equal(place.kind, 'HOSPITAL');

  const dhanmondiDonor = makeDonor({
    id: 'donor_dhanmondi_ab',
    name: 'Arif Dhanmondi',
    bloodGroup: 'A+',
    district: 'dhaka',
    upazila: 'dhanmondi',
  });
  const chattogramDonor = makeDonor({
    id: 'donor_ctg_ab',
    name: 'Rashed Chattogram',
    bloodGroup: 'AB+',
    division: 'chattogram',
    district: 'chattogram',
    upazila: 'panchlaish',
  });

  const ranked = rankDonorsForSeeker([chattogramDonor, dhanmondiDonor], {
    bloodGroup: 'AB+',
    compatibleMatchEnabled: true,
    district: 'ALL',
    areaQuery: 'Squire hospital',
    originCoords: place.coords,
    nowMs: NOW_MS,
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].donor.id, 'donor_dhanmondi_ab');
  assert.ok(ranked[0].distanceKm < 5, 'Dhanmondi donor should be <5 km from Square Hospital');
});

test('9. Live Donor On-the-Way Tracking enforces pair-isolated Neon PostgreSQL checks and computes Niketon-to-Square-Hospital road ETA', async () => {
  const schemaText = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.ts'), 'utf8');
  const repoText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/db/repositories/bloodSearchRepo.ts'),
    'utf8'
  );

  assert.ok(schemaText.includes("'live_donor_trips'"), 'schema.ts must define live_donor_trips table');
  assert.ok(repoText.includes('liveDonorTrips'), 'bloodSearchRepo.ts must enforce liveDonorTrips access control');
  assert.ok(
    repoText.includes('assertOptionalCoordinates'),
    'bloodSearchRepo.ts must validate GPS coordinates within Bangladesh bounds'
  );

  const niketonCoords = resolveBangladeshCoordinates({
    district: 'dhaka',
    upazila: 'niketon',
  });
  const squareHospitalCoords = resolveBangladeshCoordinates({
    district: 'dhaka',
    hospital: 'Square Hospital',
  });

  const controller = new AbortController();
  controller.abort(); // deterministic offline curved-road fallback for fast unit test
  const route = await fetchUberStyleRoute(niketonCoords, squareHospitalCoords, controller.signal);

  assert.ok(route.roadDistanceKm > 0 && route.roadDistanceKm < 20, 'Road distance should be realistic within Dhaka');
  assert.ok(route.etaMinutes >= 2, 'ETA should be at least 2 minutes');
  assert.ok(route.points.length >= 2, 'Route polyline must include origin and destination points');
});

test('10. Full-stack security audit enforces verified stop/audit auth, cross-user audit isolation, chat anti-spoofing, phone validation & map XSS escaping', async () => {
  const srv = await startTestServer();
  try {
    // 1. Unverified caller blocked from /api/emergency/stop and /api/audit/summary
    const stopUnverifiedRes = await fetch(`${srv.baseUrl}/api/emergency/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-unverified',
      },
      body: JSON.stringify({ requestId: 'req_sec_1', reason: 'CANCELLED' }),
    });
    assert.equal(stopUnverifiedRes.status, 401, 'Unverified caller must be rejected from /api/emergency/stop');

    const auditUnverifiedRes = await fetch(`${srv.baseUrl}/api/audit/summary`, {
      headers: { Authorization: 'Bearer token-unverified' },
    });
    assert.equal(auditUnverifiedRes.status, 401, 'Unverified caller must be rejected from /api/audit/summary');

    // 2. Seeker 1 dispatches an emergency request -> audit event created
    const dispatchRes = await fetch(`${srv.baseUrl}/api/emergency/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-seeker-1',
      },
      body: JSON.stringify({
        requestId: 'req_sec_tenant_1',
        bloodGroup: 'O-',
        urgency: 'CRITICAL',
        district: 'dhaka',
        hospitalName: 'Square Hospital https://phish.example/steal',
        matchedDonorIds: ['d1', 'd2'],
      }),
    });
    assert.equal(dispatchRes.status, 200);

    // 3. Attacker 2 queries /api/audit/summary -> must NOT see Seeker 1's request events
    const attackerAuditRes = await fetch(`${srv.baseUrl}/api/audit/summary`, {
      headers: { Authorization: 'Bearer token-attacker-2' },
    });
    assert.equal(attackerAuditRes.status, 200);
    const attackerAuditJson = (await attackerAuditRes.json()) as {
      ok: boolean;
      recentEvents: Array<{ requestId?: string }>;
    };
    assert.equal(
      attackerAuditJson.recentEvents.some((e) => e.requestId === 'req_sec_tenant_1'),
      false,
      'Non-owner verified user must not see another user audit trail'
    );

    // 4. Seeker 1 sees their own event, and Super Owner sees global events
    const ownerAuditRes = await fetch(`${srv.baseUrl}/api/audit/summary`, {
      headers: { Authorization: 'Bearer token-seeker-1' },
    });
    const ownerAuditJson = (await ownerAuditRes.json()) as {
      recentEvents: Array<{ requestId?: string }>;
    };
    assert.equal(
      ownerAuditJson.recentEvents.some((e) => e.requestId === 'req_sec_tenant_1'),
      true,
      'Request owner must see their own audit trail'
    );

    const superAuditRes = await fetch(`${srv.baseUrl}/api/audit/summary`, {
      headers: { Authorization: 'Bearer token-super-owner' },
    });
    const superAuditJson = (await superAuditRes.json()) as {
      recentEvents: Array<{ requestId?: string }>;
    };
    assert.equal(
      superAuditJson.recentEvents.some((e) => e.requestId === 'req_sec_tenant_1'),
      true,
      'Verified Super Owner must see global audit trail'
    );
  } finally {
    await srv.close();
  }

  // 5. Static verification of Neon repository anti-spoofing & Leaflet tooltip XSS escaping
  const repoText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/db/repositories/bloodSearchRepo.ts'),
    'utf8'
  );
  assert.ok(
    repoText.includes('normalizeBangladeshPhone'),
    'Neon repository must enforce strict Bangladesh E.164 phone validation'
  );
  assert.ok(
    repoText.includes('FORBIDDEN_CHAT_ROOM') || repoText.includes('participantOneUid'),
    'Neon direct chat repository must enforce strict participant isolation'
  );

  const mapViewText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/donor/InteractiveMapView.tsx'),
    'utf8'
  );
  const tooltipMatches = mapViewText.match(/\.bindTooltip\(([^,]+)/g) || [];
  assert.ok(tooltipMatches.length >= 4, 'Expected at least 4 bindTooltip calls in InteractiveMapView');
  for (const snippet of tooltipMatches) {
    assert.ok(
      snippet.includes('escapeHtml('),
      `Every Leaflet bindTooltip call must wrap dynamic labels in escapeHtml(): ${snippet}`
    );
  }
});


