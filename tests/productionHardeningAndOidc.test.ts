import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { createEmergencyApiApp } from '../server';
import { setDatabaseOverrideForTesting, type BloodSearchDatabase } from '../src/db/index';
import * as fullSchema from '../src/db/schema';
import {
  adminRoles,
  authIdentities,
  loginSessions,
  users,
} from '../src/db/schema';
import { isTrustedGoogleOAuthPopupMessage } from '../src/services/bloodSearchService';
import {
  hashClientIp,
  resolveTrustedClientIp,
  SESSION_COOKIE_NAME,
  setGoogleJwksOverrideForTesting,
  sha256Hex,
} from '../src/server/authAndSessionService';
import { checkDistributedRateLimit } from '../src/server/distributedRateLimiter';
import {
  resolveGoogleOauthClientId,
  resolveGoogleOauthClientSecret,
} from '../src/server/neonRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function findCoreMigrationSql(): string {
  const drizzleDir = path.join(ROOT_DIR, 'drizzle');
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql') && f.startsWith('0000_') && !f.startsWith('rollback_'))
    .sort();
  assert.ok(files.length > 0, 'Expected generated 0000_*.sql Drizzle migration in /drizzle');
  return fs.readFileSync(path.join(drizzleDir, files[0]!), 'utf8');
}

function base64UrlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function signMockGoogleIdToken(params: {
  privateKey: crypto.KeyObject;
  kid: string;
  claims: Record<string, unknown>;
}): string {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT', kid: params.kid });
  const payload = base64UrlJson(params.claims);
  const signingInput = `${header}.${payload}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), params.privateKey);
  return `${signingInput}.${sig.toString('base64url')}`;
}

describe('BloodSearch Production Hardening: Google OIDC, Opaque Sessions, CSRF, Scrypt & IDOR', () => {
  let pgClient: PGlite;
  let db: BloodSearchDatabase;
  let server: http.Server;
  let baseUrl = '';
  let rsaPublicKey: crypto.KeyObject;
  let rsaPrivateKey: crypto.KeyObject;
  let wrongPrivateKey: crypto.KeyObject;
  const TEST_GOOGLE_CLIENT_ID = '964553073923-bloodsearchtest.apps.googleusercontent.com';
  const TEST_KID = 'google-oidc-test-kid-2026';
  let prevClientId: string | undefined;
  let prevClientSecret: string | undefined;
  let prevSandboxFlag: string | undefined;
  let prevNodeEnv: string | undefined;
  let prevVercelEnv: string | undefined;
  let prevAppUrl: string | undefined;
  let prevSuperAdminEmail: string | undefined;
  let prevAuditIpSalt: string | undefined;

  before(async () => {
    prevClientId = process.env.GOOGLE_CLIENT_ID;
    prevClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    prevSandboxFlag = process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX;
    prevNodeEnv = process.env.NODE_ENV;
    prevVercelEnv = process.env.VERCEL_ENV;
    prevAppUrl = process.env.APP_URL;
    prevSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    prevAuditIpSalt = process.env.AUDIT_IP_SALT;
    process.env.GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX = 'true';
    process.env.SUPER_ADMIN_EMAIL = 'shamimrakib015@gmail.com';
    process.env.AUDIT_IP_SALT = 'integration-test-audit-ip-salt-32-bytes';
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;

    const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    rsaPublicKey = kp.publicKey;
    rsaPrivateKey = kp.privateKey;
    wrongPrivateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

    setGoogleJwksOverrideForTesting(new Map([[TEST_KID, rsaPublicKey]]));

    pgClient = new PGlite();
    const ddlSql = findCoreMigrationSql();
    await pgClient.exec(ddlSql.replace(/--> statement-breakpoint/g, '\n'));

    db = drizzlePglite(pgClient, { schema: fullSchema }) as unknown as BloodSearchDatabase;
    setDatabaseOverrideForTesting(db);

    await db.insert(users).values({
      uid: 'uid_test_super_admin',
      email: 'shamimrakib015@gmail.com',
      emailVerified: true,
      displayName: 'Test Super Admin',
    });
    await db.insert(adminRoles).values({
      userUid: 'uid_test_super_admin',
      email: 'shamimrakib015@gmail.com',
      role: 'SUPER_ADMIN',
    });

    const app = createEmergencyApiApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    process.env.APP_URL = baseUrl;
  });

  it('does not treat OAuth placeholder values as configured credentials', () => {
    const envKeys = [
      'GOOGLE_CLIENT_ID',
      'VITE_GOOGLE_CLIENT_ID',
      'OAUTH_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OAUTH_CLIENT_SECRET',
    ] as const;
    const previousValues = new Map(envKeys.map((key) => [key, process.env[key]]));

    try {
      process.env.GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com';
      process.env.VITE_GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
      delete process.env.OAUTH_CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = 'YOUR_GOOGLE_OAUTH_WEB_CLIENT_SECRET';
      process.env.OAUTH_CLIENT_SECRET = 'GENERATE_A_SECRET';
      assert.equal(resolveGoogleOauthClientId(), '');
      assert.equal(resolveGoogleOauthClientSecret(), '');

      process.env.VITE_GOOGLE_CLIENT_ID = TEST_GOOGLE_CLIENT_ID;
      assert.equal(resolveGoogleOauthClientId(), TEST_GOOGLE_CLIENT_ID);
    } finally {
      for (const key of envKeys) {
        const previousValue = previousValues.get(key);
        if (previousValue === undefined) delete process.env[key];
        else process.env[key] = previousValue;
      }
    }
  });

  it('trusts forwarded client IPs only from Vercel and rejects spoofed forwarded-host CORS bypasses', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.12, 198.51.100.4' };
    assert.equal(
      resolveTrustedClientIp(headers, '198.51.100.8', { NODE_ENV: 'production' }),
      '198.51.100.8'
    );
    assert.equal(
      resolveTrustedClientIp(headers, '198.51.100.8', { VERCEL: '1' }),
      '203.0.113.12'
    );
    assert.equal(
      resolveTrustedClientIp({ 'x-forwarded-for': 'not-an-ip' }, '198.51.100.8', { VERCEL: '1' }),
      '198.51.100.8'
    );

    const corsBypass = await fetch(`${baseUrl}/api/v1/auth/config`, {
      headers: {
        Origin: 'https://attacker.example',
        'X-Forwarded-Host': 'attacker.example',
      },
    });
    assert.equal(corsBypass.status, 403);
  });

  after(async () => {
    setGoogleJwksOverrideForTesting(null);
    setDatabaseOverrideForTesting(null);
    if (prevClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevClientId;
    if (prevClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevClientSecret;
    if (prevSandboxFlag === undefined) delete process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX;
    else process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX = prevSandboxFlag;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
    if (prevSuperAdminEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
    else process.env.SUPER_ADMIN_EMAIL = prevSuperAdminEmail;
    if (prevAuditIpSalt === undefined) delete process.env.AUDIT_IP_SALT;
    else process.env.AUDIT_IP_SALT = prevAuditIpSalt;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pgClient.close();
  });

  it('1. Verifies Google OIDC RS256 ID tokens, enforces iss/aud/exp/email_verified, blocks nonce replay, and stores SHA-256 session hash', async () => {
    const expectedIpHash = crypto
      .createHmac('sha256', 'integration-test-audit-ip-salt-32-bytes')
      .update('IP:198.51.100.10', 'utf8')
      .digest('hex')
      .slice(0, 32);
    assert.equal(hashClientIp('198.51.100.10'), expectedIpHash);

    const popupSource = {};
    assert.equal(
      isTrustedGoogleOAuthPopupMessage(baseUrl, popupSource, popupSource, baseUrl),
      true
    );
    assert.equal(
      isTrustedGoogleOAuthPopupMessage('https://attacker.example', popupSource, popupSource, baseUrl),
      false
    );
    assert.equal(
      isTrustedGoogleOAuthPopupMessage(baseUrl, {}, popupSource, baseUrl),
      false
    );

    const callbackErrorRes = await fetch(`${baseUrl}/auth/callback?error=access_denied`);
    const callbackErrorHtml = await callbackErrorRes.text();
    assert.ok(callbackErrorHtml.includes(`window.opener.postMessage(msg, "${baseUrl}")`));
    assert.equal(callbackErrorHtml.includes("postMessage(msg, '*')"), false);

    const nonceRes = await fetch(`${baseUrl}/api/v1/auth/google/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectOrigin: baseUrl }),
    });
    assert.equal(nonceRes.status, 200);
    const { nonce } = await nonceRes.json();
    assert.ok(typeof nonce === 'string' && nonce.length >= 24);

    const nowSec = Math.floor(Date.now() / 1000);

    const badSigToken = signMockGoogleIdToken({
      privateKey: wrongPrivateKey,
      kid: TEST_KID,
      claims: {
        iss: 'https://accounts.google.com',
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: 'google-sub-alice-001',
        email: 'alice.oidc@bloodsearch.org',
        email_verified: true,
        name: 'Alice Rahman',
        nonce,
        iat: nowSec - 5,
        exp: nowSec + 300,
      },
    });
    const badSigRes = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: badSigToken, nonce }),
    });
    assert.equal(badSigRes.status, 401);

    const badAudToken = signMockGoogleIdToken({
      privateKey: rsaPrivateKey,
      kid: TEST_KID,
      claims: {
        iss: 'https://accounts.google.com',
        aud: 'wrong-client-id.apps.googleusercontent.com',
        sub: 'google-sub-alice-001',
        email: 'alice.oidc@bloodsearch.org',
        email_verified: true,
        nonce,
        iat: nowSec - 5,
        exp: nowSec + 300,
      },
    });
    const badAudRes = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: badAudToken, nonce }),
    });
    assert.equal(badAudRes.status, 401);

    const unverifiedEmailToken = signMockGoogleIdToken({
      privateKey: rsaPrivateKey,
      kid: TEST_KID,
      claims: {
        iss: 'https://accounts.google.com',
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: 'google-sub-alice-001',
        email: 'alice.oidc@bloodsearch.org',
        email_verified: false,
        nonce,
        iat: nowSec - 5,
        exp: nowSec + 300,
      },
    });
    const unverifiedRes = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: unverifiedEmailToken, nonce }),
    });
    assert.equal(unverifiedRes.status, 401);

    const validIdToken = signMockGoogleIdToken({
      privateKey: rsaPrivateKey,
      kid: TEST_KID,
      claims: {
        iss: 'https://accounts.google.com',
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: 'google-sub-alice-001',
        email: 'alice.oidc@bloodsearch.org',
        email_verified: true,
        name: 'Alice Rahman',
        nonce,
        iat: nowSec - 5,
        exp: nowSec + 300,
      },
    });
    const okRes = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: validIdToken, nonce }),
    });
    assert.equal(okRes.status, 200);

    const setCookie = okRes.headers.get('set-cookie') || '';
    assert.equal(setCookie.includes(`${SESSION_COOKIE_NAME}=`), true);
    assert.equal(setCookie.includes('HttpOnly'), true);

    const okJson = await okRes.json();
    assert.equal(okJson.ok, true);
    assert.equal(okJson.user.email, 'alice.oidc@bloodsearch.org');
    assert.ok(String(okJson.sessionToken).startsWith('bs_sess_'));
    assert.ok(String(okJson.csrfToken).length >= 32);

    const sessionRows = await db
      .select()
      .from(loginSessions)
      .where(eq(loginSessions.userUid, okJson.user.uid));
    assert.equal(sessionRows.length, 1);
    assert.equal(sessionRows[0]!.sessionTokenHash, sha256Hex(okJson.sessionToken));
    assert.equal(JSON.stringify(sessionRows).includes(okJson.sessionToken), false);

    const takeoverRegisterRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.oidc@bloodsearch.org',
        password: 'AttackerPassword123!',
        displayName: 'Attacker',
      }),
    });
    assert.equal(takeoverRegisterRes.status, 409);

    const takeoverLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.oidc@bloodsearch.org',
        password: 'AttackerPassword123!',
      }),
    });
    assert.equal(takeoverLoginRes.status, 401);
    const [linkedPasswordIdentity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, 'EMAIL_PASSWORD'),
          eq(authIdentities.providerSubject, 'alice.oidc@bloodsearch.org')
        )
      );
    assert.equal(linkedPasswordIdentity, undefined);

    const replayRes = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: validIdToken, nonce }),
    });
    assert.equal(replayRes.status, 401);
  });

  it('2. Enforces X-CSRF-Token on HttpOnly cookie mutations, supports APK Bearer sessions, revokes on logout, and blocks SUSPENDED accounts', async () => {
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tanvir.donor@bloodsearch.org',
        password: 'StrongPassword#2026!',
        displayName: 'Tanvir Hossain',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    const sessionToken: string = regJson.sessionToken;
    const csrfToken: string = regJson.csrfToken;
    const userUid: string = regJson.user.uid;

    const [identityRow] = await db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userUid, userUid));
    assert.ok(identityRow?.passwordHash?.startsWith('scrypt$'));
    assert.equal(identityRow?.passwordHash?.includes('StrongPassword'), false);

    const missingCsrfRes = await fetch(`${baseUrl}/api/v1/donors/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
      },
      body: JSON.stringify({
        displayName: 'Tanvir Hossain',
        bloodGroup: 'B+',
        age: 27,
        gender: 'MALE',
        district: 'Dhaka',
        area: 'Uttara Sector 7',
        phone: '01712345678',
      }),
    });
    assert.equal(missingCsrfRes.status, 403);

    const validCsrfRes = await fetch(`${baseUrl}/api/v1/donors/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        displayName: 'Tanvir Hossain',
        bloodGroup: 'B+',
        age: 27,
        gender: 'MALE',
        district: 'Dhaka',
        area: 'Uttara Sector 7',
        phone: '01712345678',
      }),
    });
    assert.equal(validCsrfRes.status, 201);

    const apkMeRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.equal(apkMeRes.status, 200);
    const apkMeJson = await apkMeRes.json();
    assert.equal(apkMeJson.authenticated, true);
    assert.equal(apkMeJson.user.uid, userUid);

    await db
      .update(users)
      .set({ accountStatus: 'SUSPENDED' })
      .where(eq(users.uid, userUid));

    const suspendedProbe = await fetch(`${baseUrl}/api/v1/donors/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        displayName: 'Tanvir Hossain',
        bloodGroup: 'B+',
        district: 'Dhaka',
        area: 'Uttara',
        phone: '01712345678',
      }),
    });
    assert.equal(suspendedProbe.status === 401 || suspendedProbe.status === 403, true);

    await db.update(users).set({ accountStatus: 'ACTIVE' }).where(eq(users.uid, userUid));

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutProbe = await fetch(`${baseUrl}/api/v1/donors/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        displayName: 'Tanvir Hossain',
        bloodGroup: 'B+',
        district: 'Dhaka',
        area: 'Uttara',
        phone: '01712345678',
      }),
    });
    assert.equal(afterLogoutProbe.status, 401);
  });

  it('3. Enforces 5-attempt login lockout, anti-enumeration password reset, and single-use reset token consumption', async () => {
    const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' },
      body: JSON.stringify({
        email: 'lockout.target@bloodsearch.org',
        password: 'InitialPassword#99',
        displayName: 'Farhan Kabir',
      }),
    });
    assert.equal(reg.status, 201);
    const { sessionToken: initialSession } = await reg.json();

    for (let i = 1; i <= 5; i++) {
      const bad = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `203.0.113.${20 + i}`,
        },
        body: JSON.stringify({
          email: 'lockout.target@bloodsearch.org',
          password: `WrongPassAttempt_${i}`,
        }),
      });
      assert.equal(bad.status === 401 || bad.status === 423 || bad.status === 429, true);
    }

    const lockedAttempt = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.50' },
      body: JSON.stringify({
        email: 'lockout.target@bloodsearch.org',
        password: 'InitialPassword#99',
      }),
    });
    assert.equal(lockedAttempt.status === 423 || lockedAttempt.status === 429, true);

    const unknownReset = await fetch(`${baseUrl}/api/v1/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.60' },
      body: JSON.stringify({ email: 'does.not.exist@bloodsearch.org' }),
    });
    assert.equal(unknownReset.status, 200);

    const rawResetToken = `bs_rst_${crypto.randomBytes(24).toString('hex')}`;
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'lockout.target@bloodsearch.org'));
    assert.ok(targetUser);

    await db
      .update(authIdentities)
      .set({
        passwordResetTokenHash: sha256Hex(rawResetToken),
        passwordResetExpiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .where(
        and(
          eq(authIdentities.userUid, targetUser.uid),
          eq(authIdentities.provider, 'EMAIL_PASSWORD')
        )
      );

    const confirmRes = await fetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.61' },
      body: JSON.stringify({
        token: rawResetToken,
        newPassword: 'RotatedSafePassword#2026!',
      }),
    });
    assert.equal(confirmRes.status, 200);

    const reuseResetRes = await fetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.62' },
      body: JSON.stringify({
        token: rawResetToken,
        newPassword: 'AnotherPassword#2026!',
      }),
    });
    assert.equal(reuseResetRes.status === 400 || reuseResetRes.status === 401, true);

    const oldSessRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${initialSession}` },
    });
    const oldSessJson = await oldSessRes.json();
    assert.equal(oldSessJson.authenticated, false);
  });

  it('4. Enforces PostgreSQL distributed rate limiting, Capacitor CORS allowlist, and Direct Chat participant IDOR isolation', async () => {
    const bucketKey = `test_dist_rl_${Date.now()}`;
    const r1 = await checkDistributedRateLimit(db, bucketKey, 2, 60_000);
    const r2 = await checkDistributedRateLimit(db, bucketKey, 2, 60_000);
    const r3 = await checkDistributedRateLimit(db, bucketKey, 2, 60_000);
    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
    assert.ok(r3.retryAfterSec >= 1);

    const capPreflight = await fetch(`${baseUrl}/api/v1/donors/search`, {
      headers: { Origin: 'capacitor://localhost' },
    });
    assert.equal(capPreflight.status, 200);
    assert.equal(capPreflight.headers.get('access-control-allow-origin'), 'capacitor://localhost');

    const regUser = async (email: string, name: string, ip: string) => {
      const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password: 'ChatSafePassword#2026', displayName: name }),
      });
      assert.equal(r.status, 201);
      return r.json();
    };

    const userA = await regUser('chata@bloodsearch.org', 'User A', '198.51.100.11');
    const userB = await regUser('chatb@bloodsearch.org', 'User B', '198.51.100.12');
    const userC = await regUser('chatc@bloodsearch.org', 'User C', '198.51.100.13');

    const createRoomRes = await fetch(`${baseUrl}/api/v1/chat/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.sessionToken}`,
        'X-Forwarded-For': '198.51.100.11',
      },
      body: JSON.stringify({
        peerUid: userB.user.uid,
        peerName: 'User B',
      }),
    });
    assert.equal(createRoomRes.status, 201);
    const roomJson = await createRoomRes.json();
    const roomId: string = roomJson.room.id;

    const sendRes = await fetch(
      `${baseUrl}/api/v1/chat/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.sessionToken}`,
          'X-Forwarded-For': '198.51.100.11',
        },
        body: JSON.stringify({
          messageText: 'Urgent B+ crossmatch confirmed at DMCH Ward 4',
        }),
      }
    );
    assert.equal(sendRes.status, 201);

    const readByB = await fetch(
      `${baseUrl}/api/v1/chat/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        headers: {
          Authorization: `Bearer ${userB.sessionToken}`,
          'X-Forwarded-For': '198.51.100.12',
        },
      }
    );
    assert.equal(readByB.status, 200);

    const readByIntruderC = await fetch(
      `${baseUrl}/api/v1/chat/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        headers: {
          Authorization: `Bearer ${userC.sessionToken}`,
          'X-Forwarded-For': '198.51.100.13',
        },
      }
    );
    assert.equal(readByIntruderC.status, 403);
  });

  it('5. Supports Google OAuth Sandbox simulation and 1-Click Super Admin login without throwing 503 in preview', async () => {
    // A. Verify /auth/google-sandbox page returns 200 and renders account chooser
    const sandboxPageRes = await fetch(`${baseUrl}/auth/google-sandbox?state=test_state&nonce=test_nonce`);
    assert.equal(sandboxPageRes.status, 200);
    const html = await sandboxPageRes.text();
    assert.ok(html.includes('Sign in with Google'));
    assert.ok(html.includes('shamimrakib015@gmail.com'));

    // B. Verify POST /api/v1/auth/google/sandbox-login directly establishes valid Super Admin session
    const instantLoginRes = await fetch(`${baseUrl}/api/v1/auth/google/sandbox-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shamimrakib015@gmail.com', displayName: 'Shamim Rakib' }),
    });
    assert.equal(instantLoginRes.status, 200);
    const loginData = await instantLoginRes.json();
    assert.equal(loginData.ok, true);
    assert.equal(loginData.user.email, 'shamimrakib015@gmail.com');
    assert.equal(loginData.role, 'SUPER_ADMIN');
    assert.ok(loginData.sessionToken.startsWith('bs_sess_'));

    // Production must never expose the simulated account chooser or synthetic login endpoint.
    const priorNodeEnv = process.env.NODE_ENV;
    const priorVercelEnv = process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    try {
      const productionSandboxPage = await fetch(`${baseUrl}/auth/google-sandbox?state=prod&nonce=prod`);
      assert.equal(productionSandboxPage.status, 404);
      const productionGoogleUrl = await fetch(`${baseUrl}/api/v1/auth/google/url`);
      assert.equal(productionGoogleUrl.status, 503);
      const productionSandboxLogin = await fetch(`${baseUrl}/api/v1/auth/google/sandbox-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'attacker@example.com', displayName: 'Attacker' }),
      });
      assert.equal(productionSandboxLogin.status, 404);
      const productionMockCallback = await fetch(
        `${baseUrl}/auth/callback?code=fake-code&state=fake-state&mockEmail=shamimrakib015%40gmail.com`,
      );
      assert.equal(productionMockCallback.status, 404);
    } finally {
      if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = priorNodeEnv;
      if (priorVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = priorVercelEnv;
    }

    // C. Verify /api/v1/auth/me accepts session token
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.sessionToken}` },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.authenticated, true);
    assert.equal(meData.isSuperAdmin, true);
  });
});
