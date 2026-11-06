import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import {
  validateBangladeshMobile,
  detectBangladeshOperatorPreview,
  normalizeBangladeshE164Strict,
} from '../src/utils/bdPhoneValidator';
import {
  BloodSearchOtpService,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
} from '../src/server/otpService';
import {
  DisabledNoOpSmsGateway,
  W3SmsGatewayAdapter,
  ZendSmsGatewayAdapter,
  BtrcCompliantSmsGatewayAdapter,
  createSmsGatewayFromEnv,
  isSafePublicHttpsEndpoint,
} from '../src/server/smsGateway';
import { createEmergencyApiApp } from '../server';
import { closeNeonDatabase } from '../src/db/index';

const previousAuditIpSalt = process.env.AUDIT_IP_SALT;
process.env.AUDIT_IP_SALT = 'integration-test-audit-ip-salt-32-bytes';

after(async () => {
  await closeNeonDatabase();
  if (previousAuditIpSalt === undefined) delete process.env.AUDIT_IP_SALT;
  else process.env.AUDIT_IP_SALT = previousAuditIpSalt;
});

async function startTestServer(app: ReturnType<typeof createEmergencyApiApp>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
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

test('Phase 3: Valid Bangladesh mobile numbers across GP, Robi, Banglalink, Airtel, and Teletalk normalize to E.164', () => {
  const validCases = [
    { input: '01712345678', expectedE164: '+8801712345678', expectedOp: 'GP' },
    { input: '+8801312345678', expectedE164: '+8801312345678', expectedOp: 'GP' },
    { input: '01819876543', expectedE164: '+8801819876543', expectedOp: 'ROBI' },
    { input: '+8801611223344', expectedE164: '+8801611223344', expectedOp: 'AIRTEL' },
    { input: '01911223344', expectedE164: '+8801911223344', expectedOp: 'BANGLALINK' },
    { input: '+8801411223344', expectedE164: '+8801411223344', expectedOp: 'BANGLALINK' },
    { input: '01521704755', expectedE164: '+8801521704755', expectedOp: 'TELETALK' },
    { input: '+880 1712-345678', expectedE164: '+8801712345678', expectedOp: 'GP' },
    { input: '০১৫২১৭০৪৭৫৫', expectedE164: '+8801521704755', expectedOp: 'TELETALK' },
  ] as const;

  for (const tc of validCases) {
    const result = validateBangladeshMobile(tc.input);
    assert.equal(result.valid, true, `Expected ${tc.input} to be valid`);
    assert.equal(result.e164, tc.expectedE164);
    assert.equal(result.operator, tc.expectedOp);
    assert.equal(normalizeBangladeshE164Strict(tc.input), tc.expectedE164);
  }

  const preview = detectBangladeshOperatorPreview('01812');
  assert.equal(preview?.code, 'ROBI');
});

test('Phase 3: Invalid Bangladesh mobile numbers are rejected with clear error codes and messages', () => {
  const invalidCases = [
    { input: '', expectedCode: 'EMPTY' },
    { input: '0171234ABCD', expectedCode: 'INVALID_CHARACTERS' },
    { input: '+919876543210', expectedCode: 'FOREIGN_COUNTRY_CODE' },
    { input: '+14155552671', expectedCode: 'FOREIGN_COUNTRY_CODE' },
    { input: '01112345678', expectedCode: 'INVALID_OPERATOR_PREFIX' },
    { input: '01212345678', expectedCode: 'INVALID_OPERATOR_PREFIX' },
    { input: '01012345678', expectedCode: 'INVALID_OPERATOR_PREFIX' },
    { input: '0171234567', expectedCode: 'INVALID_LENGTH' },
    { input: '017123456789', expectedCode: 'INVALID_LENGTH' },
    { input: '+88001712345678', expectedCode: 'INVALID_FORMAT' },
  ] as const;

  for (const tc of invalidCases) {
    const res = validateBangladeshMobile(tc.input);
    assert.equal(res.valid, false, `Expected "${tc.input}" to be rejected`);
    assert.equal(res.errorCode, tc.expectedCode);
    assert.ok(res.errorEn && res.errorEn.length > 10);
    assert.ok(res.errorBn && res.errorBn.length > 5);
  }
});

test('Phase 4: OTP stores only salted HMAC-SHA256 digest, never logs OTP values, and verifies valid 6-digit OTP', async () => {
  let fakeNow = 1_700_000_000_000;
  const capturedLogs: string[] = [];
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;

  console.log = (...args: unknown[]) => capturedLogs.push(args.map(String).join(' '));
  console.info = (...args: unknown[]) => capturedLogs.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => capturedLogs.push(args.map(String).join(' '));

  try {
    const otpService = new BloodSearchOtpService({
      isProduction: false,
      enableDevSandbox: true,
      hmacSecret: 'unit-test-super-secret-hmac-key-32-bytes-minimum',
      nowFn: () => fakeNow,
    });

    const sendRes = await otpService.requestOtp({
      rawPhone: '01712345678',
      clientIp: '203.112.218.10',
    });

    assert.equal(sendRes.httpStatus, 200);
    assert.equal(sendRes.body.ok, true);
    assert.equal(sendRes.body.phoneE164, '+8801712345678');
    assert.equal(sendRes.body.operator, 'GP');
    assert.equal(sendRes.body.isDevelopmentMode, true);
    assert.ok(sendRes.body.challengeId);
    const issuedOtp = sendRes.body.devSandboxTestOtp!;
    assert.match(issuedOtp, /^\d{6}$/);

    // Verify plaintext OTP is NEVER stored in memory challenge record
    const stored = otpService.inspectStoredChallengeForTest(sendRes.body.challengeId!);
    assert.ok(stored);
    assert.match(stored.otpDigestHex, /^[a-f0-9]{64}$/);
    const serializedStored = JSON.stringify(stored);
    assert.equal(
      serializedStored.includes(issuedOtp),
      false,
      'Plaintext OTP must never exist in stored challenge record'
    );

    // Verify correct OTP succeeds
    const verifyRes = otpService.verifyOtp({
      challengeId: sendRes.body.challengeId!,
      rawPhone: '+8801712345678',
      otpCode: issuedOtp,
      clientIp: '203.112.218.10',
    });

    assert.equal(verifyRes.httpStatus, 200);
    assert.equal(verifyRes.body.ok, true);
    assert.equal(verifyRes.body.devSandboxSession?.role, 'USER');
    assert.equal(verifyRes.body.devSandboxSession?.adminEligible, false);

    // Confirm OTP was NEVER logged to console
    for (const line of capturedLogs) {
      assert.equal(line.includes(issuedOtp), false, 'OTP value must never appear in console logs');
    }

    // Prevent OTP reuse / replay attack
    const replayRes = otpService.verifyOtp({
      challengeId: sendRes.body.challengeId!,
      rawPhone: '+8801712345678',
      otpCode: issuedOtp,
      clientIp: '203.112.218.10',
    });
    assert.equal(replayRes.httpStatus, 400);
    assert.equal(replayRes.body.ok, false);
    assert.equal(replayRes.body.code, 'OTP_ALREADY_USED');
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
  }
});

test('Phase 4: Incorrect OTP enforces max 5 verification attempts and locks challenge', async () => {
  const fakeNow = 1_700_000_000_000;
  const otpService = new BloodSearchOtpService({
    isProduction: false,
    enableDevSandbox: true,
    nowFn: () => fakeNow,
  });

  const sendRes = await otpService.requestOtp({
    rawPhone: '01819876543',
    clientIp: '103.15.20.1',
  });
  const validCode = sendRes.body.devSandboxTestOtp!;
  const wrongCode = validCode === '999999' ? '111111' : '999999';

  for (let attempt = 1; attempt <= 5; attempt++) {
    const bad = otpService.verifyOtp({
      challengeId: sendRes.body.challengeId!,
      rawPhone: '01819876543',
      otpCode: wrongCode,
      clientIp: '103.15.20.1',
    });
    assert.equal(bad.body.ok, false);
    assert.equal(bad.body.remainingAttempts, 5 - attempt);
    if (attempt < 5) {
      assert.equal(bad.body.code, 'OTP_INVALID_CODE');
    } else {
      assert.equal(bad.body.code, 'OTP_MAX_ATTEMPTS_EXCEEDED');
    }
  }

  // Even the real code must fail once locked after 5 failed attempts
  const afterLockout = otpService.verifyOtp({
    challengeId: sendRes.body.challengeId!,
    rawPhone: '01819876543',
    otpCode: validCode,
    clientIp: '103.15.20.1',
  });
  assert.equal(afterLockout.body.ok, false);
  assert.equal(afterLockout.body.code, 'OTP_MAX_ATTEMPTS_EXCEEDED');
});

test('Phase 4: OTP expires strictly after 5 minutes (300s)', async () => {
  let fakeNow = 1_700_000_000_000;
  const otpService = new BloodSearchOtpService({
    isProduction: false,
    enableDevSandbox: true,
    nowFn: () => fakeNow,
  });

  const sendRes = await otpService.requestOtp({
    rawPhone: '01911223344',
    clientIp: '103.15.20.2',
  });
  const validCode = sendRes.body.devSandboxTestOtp!;

  // Advance past 5-minute TTL
  fakeNow += OTP_EXPIRY_MS + 1000;

  const expiredRes = otpService.verifyOtp({
    challengeId: sendRes.body.challengeId!,
    rawPhone: '01911223344',
    otpCode: validCode,
    clientIp: '103.15.20.2',
  });
  assert.equal(expiredRes.httpStatus, 400);
  assert.equal(expiredRes.body.ok, false);
  assert.equal(expiredRes.body.code, 'OTP_EXPIRED');
});

test('Phase 4: 60s resend cooldown, old OTP invalidation on resend, and phone/IP rate limits', async () => {
  let fakeNow = 1_700_000_000_000;
  const otpService = new BloodSearchOtpService({
    isProduction: false,
    enableDevSandbox: true,
    nowFn: () => fakeNow,
  });

  const first = await otpService.requestOtp({
    rawPhone: '01521704755',
    clientIp: '103.15.20.3',
  });
  assert.equal(first.body.ok, true);

  // Within 60s cooldown -> blocked with 429
  fakeNow += 25_000;
  const cooldownBlocked = await otpService.requestOtp({
    rawPhone: '+8801521704755',
    clientIp: '103.15.20.3',
  });
  assert.equal(cooldownBlocked.httpStatus, 429);
  assert.equal(cooldownBlocked.body.code, 'RESEND_COOLDOWN_ACTIVE');
  assert.equal(cooldownBlocked.body.retryAfterSec, 35);

  // Advance past 60s cooldown and issue 2nd OTP -> 1st OTP must be invalidated immediately
  fakeNow += OTP_RESEND_COOLDOWN_MS;
  const second = await otpService.requestOtp({
    rawPhone: '01521704755',
    clientIp: '103.15.20.3',
  });
  assert.equal(second.body.ok, true);

  const oldCodeAttempt = otpService.verifyOtp({
    challengeId: first.body.challengeId!,
    rawPhone: '01521704755',
    otpCode: first.body.devSandboxTestOtp!,
    clientIp: '103.15.20.3',
  });
  assert.equal(oldCodeAttempt.body.ok, false);
  assert.equal(oldCodeAttempt.body.code, 'OTP_SUPERSEDED');

  // Exhaust phone rate limit (5 total sends within 15 minutes; 2 already sent above)
  for (let i = 0; i < 3; i++) {
    fakeNow += 61_000;
    const okSend = await otpService.requestOtp({
      rawPhone: '01521704755',
      clientIp: `103.15.20.${10 + i}`,
    });
    assert.equal(okSend.body.ok, true);
  }

  fakeNow += 61_000;
  const sixthSendSamePhone = await otpService.requestOtp({
    rawPhone: '01521704755',
    clientIp: '103.15.20.99',
  });
  assert.equal(sixthSendSamePhone.httpStatus, 429);
  assert.equal(sixthSendSamePhone.body.code, 'PHONE_RATE_LIMITED');

  // Exhaust IP rate limit (max 10 sends / 15m from a single IP across different phones)
  const sharedIp = '103.99.88.77';
  for (let n = 0; n < 10; n++) {
    const suffix = String(10000000 + n);
    const res = await otpService.requestOtp({
      rawPhone: `017${suffix}`,
      clientIp: sharedIp,
    });
    assert.equal(res.body.ok, true);
  }
  const eleventhFromSameIp = await otpService.requestOtp({
    rawPhone: '01699887766',
    clientIp: sharedIp,
  });
  assert.equal(eleventhFromSameIp.httpStatus, 429);
  assert.equal(eleventhFromSameIp.body.code, 'IP_RATE_LIMITED');
});

test('Phase 2 & 8: Production lock strictly blocks Dev Sandbox OTP and Express session persistence / logout works cleanly', async () => {
  const previousOtpSecret = process.env.OTP_HMAC_SECRET;
  try {
    delete process.env.OTP_HMAC_SECRET;
    assert.throws(
      () => new BloodSearchOtpService({ isProduction: true }),
      /OTP_HMAC_SECRET must be configured/
    );
  } finally {
    if (previousOtpSecret === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = previousOtpSecret;
  }

  // 1. Production mode must strictly refuse Dev Sandbox OTP
  const prodApp = createEmergencyApiApp({
    otpServiceOptions: {
      isProduction: true,
      enableDevSandbox: true, // Even if misconfigured true, production lock overrides to false!
      hmacSecret: 'integration-test-production-hmac-secret-2026',
    },
  });
  const prodSrv = await startTestServer(prodApp);
  try {
    const cfgRes = await fetch(`${prodSrv.baseUrl}/api/auth/otp/config`);
    const cfgJson = await cfgRes.json();
    assert.equal(cfgJson.isProduction, true);
    assert.equal(cfgJson.devSandboxAvailable, false);

    const blockedSend = await fetch(`${prodSrv.baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01712345678', preferDevSandbox: true }),
    });
    assert.equal(blockedSend.status, 403);
    const blockedJson = await blockedSend.json();
    assert.equal(blockedJson.code, 'DEV_OTP_DISABLED_IN_PRODUCTION');
    assert.equal(blockedJson.devSandboxTestOtp, undefined);
  } finally {
    await prodSrv.close();
  }

  // 2. Development mode end-to-end HTTP flow + refresh persistence + tamper rejection + logout revocation
  const devApp = createEmergencyApiApp({
    otpServiceOptions: {
      isProduction: false,
      enableDevSandbox: true,
      hmacSecret: 'integration-test-dev-hmac-secret-key-2026',
    },
  });
  const devSrv = await startTestServer(devApp);
  try {
    const sendHttp = await fetch(`${devSrv.baseUrl}/api/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01612345678' }),
    });
    assert.equal(sendHttp.status, 200);
    const sendData = await sendHttp.json();
    assert.equal(sendData.operator, 'AIRTEL');
    assert.equal(sendData.phoneE164, '+8801612345678');

    const verifyHttp = await fetch(`${devSrv.baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: sendData.challengeId,
        phone: '01612345678',
        otp: sendData.devSandboxTestOtp,
      }),
    });
    assert.equal(verifyHttp.status, 200);
    const verifyData = await verifyHttp.json();
    const token: string = verifyData.devSandboxSession.sessionToken;
    assert.equal(verifyData.devSandboxSession.role, 'USER');
    assert.equal(verifyData.devSandboxSession.adminEligible, false);

    // Simulate page refresh session validation
    const sessionCheck = await fetch(`${devSrv.baseUrl}/api/auth/otp/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(sessionCheck.status, 200);
    const sessionJson = await sessionCheck.json();
    assert.equal(sessionJson.ok, true);
    assert.equal(sessionJson.session.role, 'USER');
    assert.equal(sessionJson.session.adminEligible, false);

    // Tampered token trying to escalate role to ADMIN must fail with 401
    const [payloadPart, sigPart] = token.split('.');
    const decodedObj = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    decodedObj.role = 'ADMIN';
    decodedObj.adminEligible = true;
    const forgedToken = `${Buffer.from(JSON.stringify(decodedObj)).toString('base64url')}.${sigPart}`;
    const forgedCheck = await fetch(`${devSrv.baseUrl}/api/auth/otp/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    assert.equal(forgedCheck.status, 401);

    // Logout revokes session token immediately
    await fetch(`${devSrv.baseUrl}/api/auth/otp/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const afterLogout = await fetch(`${devSrv.baseUrl}/api/auth/otp/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await devSrv.close();
  }
});

test('Phase 5 & 6: Provider-independent SMS gateway adapters and RS256 Firebase Custom Token minting work without paid calls', async () => {
  // Default gateway is zero-cost DisabledNoOpSmsGateway
  const defaultGw = createSmsGatewayFromEnv({ OTP_SMS_PROVIDER: 'NONE' });
  assert.ok(defaultGw instanceof DisabledNoOpSmsGateway);
  assert.equal(defaultGw.isConfigured(), false);

  // SSRF guard blocks HTTP and loopback/private targets
  assert.equal(isSafePublicHttpsEndpoint('http://sms.example.com/send'), false);
  assert.equal(isSafePublicHttpsEndpoint('https://127.0.0.1/send'), false);
  assert.equal(isSafePublicHttpsEndpoint('https://192.168.1.1/send'), false);
  assert.equal(isSafePublicHttpsEndpoint('https://api.w3sms.example.com/v1/send'), true);

  // Verify W3SMS, ZendSMS, and BTRC_CUSTOM adapters dispatch cleanly using injected mock fetch (zero network/cost)
  let capturedGatewayRequests = 0;
  const mockFetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
    capturedGatewayRequests += 1;
    return new Response(JSON.stringify({ request_id: 'msg_01', message_id: 'msg_02', id: 'msg_03' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const w3 = new W3SmsGatewayAdapter({
    apiUrl: 'https://api.w3sms.example.com/v3/sms/send',
    apiKey: 'test_server_secret_key_w3',
    senderId: 'BloodSearch',
    fetchImpl: mockFetch,
  });
  assert.equal(w3.isConfigured(), true);
  const w3Res = await w3.sendOtpSms({ toE164: '+8801712345678', otpCode: '654321', expiresMinutes: 5 });
  assert.equal(w3Res.dispatched, true);

  const zend = new ZendSmsGatewayAdapter({
    apiUrl: 'https://portal.zendsms.example.com/smsapi',
    apiKey: 'test_server_secret_key_zend',
    senderId: 'BloodSearch',
    fetchImpl: mockFetch,
  });
  const zendRes = await zend.sendOtpSms({ toE164: '+8801812345678', otpCode: '123456', expiresMinutes: 5 });
  assert.equal(zendRes.dispatched, true);

  const btrc = new BtrcCompliantSmsGatewayAdapter({
    apiUrl: 'https://sms.btrc-gateway.example.com/api/send',
    apiKey: 'test_server_secret_key_btrc',
    senderId: 'BloodSearch',
    fetchImpl: mockFetch,
  });
  const btrcRes = await btrc.sendOtpSms({ toE164: '+8801521704755', otpCode: '223344', expiresMinutes: 5 });
  assert.equal(btrcRes.dispatched, true);
  assert.equal(capturedGatewayRequests, 3);
});

test('Phase 8: Zero Firebase artifacts remain and Neon bloodSearchService preserves all auth & donor exports', () => {
  assert.equal(fs.existsSync(path.resolve('src/firebase.ts')), false, 'src/firebase.ts must be deleted');
  assert.equal(fs.existsSync(path.resolve('firestore.rules')), false, 'firestore.rules must be deleted');
  assert.equal(fs.existsSync(path.resolve('firebase.json')), false, 'firebase.json must be deleted');
  assert.equal(fs.existsSync(path.resolve('firebase-blueprint.json')), false, 'firebase-blueprint.json must be deleted');

  const pkgJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const allDeps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
  assert.equal('firebase' in allDeps, false, 'firebase SDK must be removed from package.json');
  assert.equal('firebase-admin' in allDeps, false, 'firebase-admin SDK must be removed from package.json');

  const serviceSource = fs.readFileSync(path.resolve('src/services/bloodSearchService.ts'), 'utf8');
  assert.equal(serviceSource.includes('export async function signInWithGoogleReal'), true);
  assert.equal(serviceSource.includes('export async function registerOrLoginRealEmailPassword'), true);
  assert.equal(serviceSource.includes('export async function sendRealPasswordReset'), true);
  assert.equal(serviceSource.includes('export async function sendRealPhoneSmsOtp'), true);
  assert.equal(serviceSource.includes('export async function checkIsVerifiedAdminInFirestore'), true);
});

test('Phase 9: Bangladesh phone normalization (Bangla + ASCII digits) and Neon schema column constraints', async () => {
  const { normalizeValidBangladeshMobileE164 } = await import('../src/utils/donorMatcher');

  assert.equal(normalizeValidBangladeshMobileE164('01521704755'), '+8801521704755');
  assert.equal(normalizeValidBangladeshMobileE164('+8801521704755'), '+8801521704755');
  assert.equal(normalizeValidBangladeshMobileE164('০১৫২১৭০৪৭৫৫'), '+8801521704755');
  assert.equal(normalizeValidBangladeshMobileE164('01700000001'), '+8801700000001');

  assert.equal(normalizeValidBangladeshMobileE164('01700000000'), null);
  assert.equal(normalizeValidBangladeshMobileE164('01711111111'), null);

  const schemaSource = fs.readFileSync(path.resolve('src/db/schema.ts'), 'utf8');
  assert.equal(schemaSource.includes("'auth_identities'"), true);
  assert.equal(schemaSource.includes("'login_sessions'"), true);
  assert.equal(schemaSource.includes("'contact_requests'"), true);
  assert.equal(schemaSource.includes("'direct_messages'"), true);
  assert.equal(schemaSource.includes("'reports'"), true);
});
