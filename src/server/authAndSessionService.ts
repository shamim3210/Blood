import crypto from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { BloodSearchDatabase } from '../db/index';
import {
  DomainSecurityError,
  hashIdentifier,
  maskBangladeshPhone,
  resolveActorRole,
  writeAuditLog,
  type AuthenticatedActor,
  type ResolvedActor,
} from '../db/repositories/bloodSearchRepo';
import { authIdentities, loginSessions, oidcNonces, users } from '../db/schema';

export const SESSION_COOKIE_NAME = 'bs_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days standard session
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours elevated admin session
export const OIDC_NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_LOCKOUT_THRESHOLD = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

interface GoogleJwkKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

let cachedGoogleJwks: { fetchedAtMs: number; keys: Map<string, crypto.KeyObject> } | null = null;
let testGoogleJwksOverride: Map<string, crypto.KeyObject> | null = null;

export function setGoogleJwksOverrideForTesting(keys: Map<string, crypto.KeyObject> | null): void {
  testGoogleJwksOverride = keys;
}

export function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function hashClientIp(rawIp: string): string {
  const salt = process.env.AUDIT_IP_SALT?.trim();
  if (!salt) {
    return hashIdentifier(`IP:${rawIp}`);
  }
  return crypto
    .createHmac('sha256', salt)
    .update(`IP:${rawIp}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export function resolveTrustedClientIp(
  headers: IncomingMessage['headers'],
  remoteAddress: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.VERCEL === '1') {
    const forwardedFor = headers['x-forwarded-for'];
    const candidate = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(',')[0]
      ?.trim();
    if (candidate && isIP(candidate)) return candidate;
  }

  if (remoteAddress && isIP(remoteAddress)) return remoteAddress;
  return '127.0.0.1';
}

export function extractHashedClientIp(req: Request | IncomingMessage): string {
  return hashClientIp(resolveTrustedClientIp(req.headers, req.socket?.remoteAddress));
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return process.env.NODE_ENV === 'production';
  }
  return false;
}

export function setOpaqueSessionCookie(
  req: Request,
  res: Response,
  opaqueToken: string,
  maxAgeMs: number
): void {
  const secure = isHttpsRequest(req);
  const maxAgeSec = Math.max(60, Math.floor(maxAgeMs / 1000));
  const sameSite = secure ? 'None' : 'Lax';
  const secureAttr = secure ? '; Secure' : '';
  const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(opaqueToken)}; Path=/; HttpOnly; SameSite=${sameSite}${secureAttr}; Max-Age=${maxAgeSec}`;
  res.setHeader('Set-Cookie', cookieVal);
}

export function clearOpaqueSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  const sameSite = secure ? 'None' : 'Lax';
  const secureAttr = secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}${secureAttr}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

// ============================================================================
// SCRYPT PASSWORD HASHING (Constant-Time Verification + Enumeration Shield)
// ============================================================================
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const SCRYPT_KEYLEN = 64;
const DUMMY_SALT = Buffer.from('626c6f6f647365617263685f64756d6d795f73616c745f7631', 'hex');

function deriveScryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await deriveScryptAsync(password, salt);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPasswordScrypt(password: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    await deriveScryptAsync(password, DUMMY_SALT);
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6) {
    await deriveScryptAsync(password, DUMMY_SALT);
    return false;
  }
  const salt = Buffer.from(parts[4]!, 'hex');
  const expected = Buffer.from(parts[5]!, 'hex');
  const candidate = await deriveScryptAsync(password, salt);
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(expected, candidate);
}

function validateStrongPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new DomainSecurityError(
      400,
      'WEAK_PASSWORD',
      'Password must be between 6 and 128 characters.'
    );
  }
}

// ============================================================================
// GOOGLE OIDC VERIFICATION (RS256 JWKS + Issuer + Audience + Exp + Nonce)
// ============================================================================
async function getGooglePublicKey(kid: string, forceRefresh = false): Promise<crypto.KeyObject | null> {
  if (testGoogleJwksOverride) {
    return testGoogleJwksOverride.get(kid) || null;
  }
  const now = Date.now();
  if (!forceRefresh && cachedGoogleJwks && now - cachedGoogleJwks.fetchedAtMs < 60 * 60 * 1000) {
    const existing = cachedGoogleJwks.keys.get(kid);
    if (existing) return existing;
  }

  const resp = await fetch(GOOGLE_JWKS_URI, {
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) {
    throw new DomainSecurityError(503, 'OIDC_JWKS_UNAVAILABLE', 'Unable to fetch Google OIDC signing keys.');
  }
  const body = (await resp.json()) as { keys?: GoogleJwkKey[] };
  const map = new Map<string, crypto.KeyObject>();
  for (const jwk of body.keys || []) {
    if (jwk.kid && jwk.kty === 'RSA' && jwk.n && jwk.e) {
      try {
        const pubKey = crypto.createPublicKey({
          key: { kty: 'RSA', n: jwk.n, e: jwk.e },
          format: 'jwk',
        });
        map.set(jwk.kid, pubKey);
      } catch {}
    }
  }
  cachedGoogleJwks = { fetchedAtMs: now, keys: map };
  return map.get(kid) || null;
}

export interface VerifiedGoogleOidcClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
  nonce?: string;
}

export async function verifyGoogleOidcIdToken(params: {
  idToken: string;
  expectedClientId: string;
  expectedNonce?: string;
  nowSec?: number;
}): Promise<VerifiedGoogleOidcClaims> {
  const rawToken = String(params.idToken || '').trim();
  const expectedAud = String(params.expectedClientId || '').trim();
  if (!expectedAud) {
    throw new DomainSecurityError(
      503,
      'GOOGLE_OIDC_NOT_CONFIGURED',
      'GOOGLE_CLIENT_ID is not configured on the server.'
    );
  }

  const segments = rawToken.split('.');
  if (segments.length !== 3) {
    throw new DomainSecurityError(401, 'INVALID_OIDC_TOKEN', 'Malformed Google OIDC ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];
  let header: { alg?: string; kid?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new DomainSecurityError(401, 'INVALID_OIDC_TOKEN', 'Invalid JWT encoding in Google OIDC token.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new DomainSecurityError(401, 'INVALID_OIDC_ALG', 'Google OIDC token must use RS256 with a valid key ID.');
  }

  let publicKey = await getGooglePublicKey(header.kid, false);
  if (!publicKey && !testGoogleJwksOverride) {
    publicKey = await getGooglePublicKey(header.kid, true);
  }
  if (!publicKey) {
    throw new DomainSecurityError(401, 'UNKNOWN_OIDC_KEY', 'Google OIDC signing key was not recognized.');
  }

  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(`${headerB64}.${payloadB64}`);
  verify.end();
  const sigValid = verify.verify(publicKey, Buffer.from(signatureB64, 'base64url'));
  if (!sigValid) {
    throw new DomainSecurityError(401, 'INVALID_OIDC_SIGNATURE', 'Google OIDC signature verification failed.');
  }

  const iss = String(payload.iss || '');
  if (!VALID_GOOGLE_ISSUERS.has(iss)) {
    throw new DomainSecurityError(401, 'INVALID_OIDC_ISSUER', 'Invalid OIDC token issuer.');
  }

  const aud = payload.aud;
  const audMatches = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;
  if (!audMatches) {
    throw new DomainSecurityError(401, 'INVALID_OIDC_AUDIENCE', 'Google OIDC audience mismatch.');
  }

  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  const iat = Number(payload.iat || 0);
  if (!Number.isFinite(exp) || exp <= nowSec - 15) {
    throw new DomainSecurityError(401, 'OIDC_TOKEN_EXPIRED', 'Google OIDC token has expired.');
  }
  if (!Number.isFinite(iat) || iat > nowSec + 120) {
    throw new DomainSecurityError(401, 'OIDC_TOKEN_FUTURE_IAT', 'Google OIDC token issued-at timestamp is invalid.');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  const sub = String(payload.sub || '').trim();
  if (!sub || !email || !email.includes('@') || !emailVerified) {
    throw new DomainSecurityError(
      401,
      'OIDC_EMAIL_UNVERIFIED',
      'A verified Google email address is required to sign in.'
    );
  }

  const tokenNonce = payload.nonce !== undefined ? String(payload.nonce) : undefined;
  if (params.expectedNonce !== undefined) {
    if (!tokenNonce || tokenNonce !== params.expectedNonce) {
      throw new DomainSecurityError(401, 'OIDC_NONCE_MISMATCH', 'Google OIDC nonce validation failed.');
    }
  }

  return {
    sub,
    email,
    emailVerified: true,
    name: String(payload.name || email.split('@')[0] || 'BloodSearch User').trim().slice(0, 140),
    picture: typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null,
    nonce: tokenNonce,
  };
}

// ============================================================================
// NONCE ISSUANCE & SINGLE-USE REPLAY PROTECTION IN NEON
// ============================================================================
export async function issueGoogleOidcNonceTx(
  db: BloodSearchDatabase,
  ipHash: string,
  redirectOrigin?: string
): Promise<{ nonce: string; state: string; expiresAtIso: string }> {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const state = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + OIDC_NONCE_TTL_MS);

  // Opportunistically clean expired nonces
  await db.delete(oidcNonces).where(lt(oidcNonces.expiresAt, new Date())).catch(() => {});

  await db.insert(oidcNonces).values({
    nonceHash: sha256Hex(nonce),
    stateHash: sha256Hex(state),
    ipHash,
    redirectOrigin: redirectOrigin ? redirectOrigin.slice(0, 255) : null,
    isConsumed: false,
    expiresAt,
  });

  return { nonce, state, expiresAtIso: expiresAt.toISOString() };
}

export async function consumeGoogleOidcNonceTx(
  db: BloodSearchDatabase,
  nonce: string,
  expectedState?: string
): Promise<{ redirectOrigin: string | null }> {
  if (!nonce || nonce.length < 12) {
    throw new DomainSecurityError(401, 'OIDC_NONCE_MISSING', 'Missing cryptographic OIDC nonce.');
  }
  const nonceHash = sha256Hex(nonce);
  const now = new Date();

  const conditions = [
    eq(oidcNonces.nonceHash, nonceHash),
    eq(oidcNonces.isConsumed, false),
    gt(oidcNonces.expiresAt, now),
  ];
  if (expectedState) {
    conditions.push(eq(oidcNonces.stateHash, sha256Hex(expectedState)));
  }

  const [consumed] = await db
    .update(oidcNonces)
    .set({ isConsumed: true, consumedAt: now })
    .where(and(...conditions))
    .returning();

  if (!consumed) {
    throw new DomainSecurityError(
      401,
      'OIDC_NONCE_REPLAY_OR_EXPIRED',
      'OIDC authentication nonce is invalid, expired, or has already been used.'
    );
  }

  return { redirectOrigin: consumed.redirectOrigin };
}

// ============================================================================
// OPAQUE SESSION MINTING, SHA-256 STORAGE, ROTATION & REVOCATION
// ============================================================================
export interface IssuedOpaqueSession {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  actor: ResolvedActor;
  userProfile: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    phoneHint: string | null;
    displayName: string;
    photoUrl: string | null;
    bloodGroup: string | null;
    district: string | null;
    area: string | null;
    authProvider: string;
    accountStatus: string;
    role: string;
  };
}

export async function createOpaqueSessionTx(
  db: BloodSearchDatabase,
  params: {
    userUid: string;
    authMethod: 'GOOGLE_OIDC' | 'EMAIL_PASSWORD' | 'PHONE_OTP';
    ipHash: string;
    userAgent: string;
    rotateExistingSessions?: boolean;
    rotatedFromSessionId?: string;
  }
): Promise<IssuedOpaqueSession> {
  const [userRow] = await db.select().from(users).where(eq(users.uid, params.userUid)).limit(1);
  if (!userRow) {
    throw new DomainSecurityError(404, 'USER_NOT_FOUND', 'User account not found.');
  }
  if (userRow.accountStatus !== 'ACTIVE') {
    throw new DomainSecurityError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended or deactivated.');
  }

  const baseActor: AuthenticatedActor = {
    uid: userRow.uid,
    email: userRow.email,
    emailVerified: userRow.emailVerified,
    displayName: userRow.displayName,
    photoUrl: userRow.photoUrl,
    ipHash: params.ipHash,
  };
  const resolvedActor = await resolveActorRole(db, baseActor);
  const isAdmin = resolvedActor.role === 'SUPER_ADMIN' || resolvedActor.role === 'CO_ADMIN' || resolvedActor.role === 'MODERATOR';

  if (params.rotateExistingSessions) {
    await db
      .update(loginSessions)
      .set({
        isRevoked: true,
        revokedReason: 'SESSION_ROTATED_ON_AUTH',
      })
      .where(and(eq(loginSessions.userUid, userRow.uid), eq(loginSessions.isRevoked, false)));
  }

  const sessionToken = `bs_sess_${crypto.randomBytes(32).toString('base64url')}`;
  const csrfToken = `bs_csrf_${crypto.randomBytes(32).toString('base64url')}`;
  const ttlMs = isAdmin ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);

  const [insertedSession] = await db
    .insert(loginSessions)
    .values({
      userUid: userRow.uid,
      sessionTokenHash: sha256Hex(sessionToken),
      csrfTokenHash: sha256Hex(csrfToken),
      authMethod: params.authMethod,
      ipHash: params.ipHash,
      userAgentSummary: String(params.userAgent || 'unknown').slice(0, 250),
      isAdminConsole: isAdmin,
      isRevoked: false,
      rotatedFromSessionId: params.rotatedFromSessionId || null,
      expiresAt,
    })
    .returning();

  await writeAuditLog(db, {
    actorUid: userRow.uid,
    actorRole: resolvedActor.role,
    action: 'SESSION_ISSUED',
    targetEntityType: 'login_sessions',
    targetEntityId: insertedSession!.id,
    outcome: 'SUCCESS',
    ipHash: params.ipHash,
    details: { authMethod: params.authMethod, rotated: Boolean(params.rotateExistingSessions) },
  });

  return {
    sessionId: insertedSession!.id,
    sessionToken,
    csrfToken,
    expiresAt,
    actor: resolvedActor,
    userProfile: {
      uid: userRow.uid,
      email: userRow.email,
      emailVerified: userRow.emailVerified,
      phoneHint: userRow.phoneHint,
      displayName: userRow.displayName,
      photoUrl: userRow.photoUrl,
      bloodGroup: userRow.bloodGroup,
      district: userRow.district,
      area: userRow.area,
      authProvider: userRow.authProvider,
      accountStatus: userRow.accountStatus,
      role: resolvedActor.role,
    },
  };
}

export async function revokeAllUserSessionsTx(
  db: BloodSearchDatabase,
  userUid: string,
  reason = 'PRIVILEGE_OR_SECURITY_CHANGE'
): Promise<void> {
  await db
    .update(loginSessions)
    .set({ isRevoked: true, revokedReason: reason.slice(0, 120) })
    .where(and(eq(loginSessions.userUid, userUid), eq(loginSessions.isRevoked, false)));
}

// ============================================================================
// GOOGLE SIGN-IN ACCOUNT LINKING / CREATION IN NEON
// ============================================================================
export async function authenticateGoogleClaimsInNeonTx(
  db: BloodSearchDatabase,
  claims: VerifiedGoogleOidcClaims,
  ipHash: string,
  userAgent: string
): Promise<IssuedOpaqueSession> {
  const now = new Date();
  let targetUid: string | null = null;

  await db.transaction(async (tx) => {
    const [existingIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, 'GOOGLE_OIDC'),
          eq(authIdentities.providerSubject, claims.sub)
        )
      )
      .limit(1);

    if (existingIdentity) {
      targetUid = existingIdentity.userUid;
      await tx
        .update(authIdentities)
        .set({
          email: claims.email,
          emailVerified: true,
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(eq(authIdentities.id, existingIdentity.id));

      await tx
        .update(users)
        .set({
          email: claims.email,
          emailVerified: true,
          photoUrl: claims.picture || undefined,
          updatedAt: now,
        })
        .where(eq(users.uid, targetUid));
      return;
    }

    // Check if a verified user with the same lowercase email already exists
    const [existingUserByEmail] = await tx
      .select()
      .from(users)
      .where(eq(users.email, claims.email))
      .limit(1);

    if (existingUserByEmail) {
      targetUid = existingUserByEmail.uid;
      await tx
        .update(users)
        .set({
          emailVerified: true,
          photoUrl: existingUserByEmail.photoUrl || claims.picture,
          updatedAt: now,
        })
        .where(eq(users.uid, targetUid));
    } else {
      targetUid = `usr_${crypto.randomBytes(12).toString('hex')}`;
      await tx.insert(users).values({
        uid: targetUid,
        email: claims.email,
        emailVerified: true,
        displayName: claims.name,
        photoUrl: claims.picture,
        authProvider: 'GOOGLE_OIDC',
        accountStatus: 'ACTIVE',
      });
    }

    await tx.insert(authIdentities).values({
      userUid: targetUid!,
      provider: 'GOOGLE_OIDC',
      providerSubject: claims.sub,
      email: claims.email,
      emailVerified: true,
      lastLoginAt: now,
    });
  });

  return createOpaqueSessionTx(db, {
    userUid: targetUid!,
    authMethod: 'GOOGLE_OIDC',
    ipHash,
    userAgent,
    rotateExistingSessions: true,
  });
}

// ============================================================================
// EMAIL + PASSWORD REGISTRATION, LOGIN & PASSWORD RESET
// ============================================================================
export async function registerEmailPasswordUserTx(
  db: BloodSearchDatabase,
  params: {
    email: string;
    password: string;
    displayName: string;
    ipHash: string;
    userAgent: string;
  }
): Promise<IssuedOpaqueSession> {
  const email = String(params.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 250) {
    throw new DomainSecurityError(400, 'INVALID_EMAIL', 'Please enter a valid email address.');
  }
  validateStrongPassword(params.password);
  const cleanName = String(params.displayName || email.split('@')[0] || 'BloodSearch User')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 140);
  if (cleanName.length < 2) {
    throw new DomainSecurityError(400, 'INVALID_NAME', 'Display name must be at least 2 characters.');
  }

  const passwordHash = await hashPasswordScrypt(params.password);
  let uid = '';

  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ uid: users.uid, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      const [existingIdentity] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, 'EMAIL_PASSWORD'),
            eq(authIdentities.providerSubject, email)
          )
        )
        .limit(1);

      if (!existingIdentity) {
        throw new DomainSecurityError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'This email is already registered. Please sign in with its existing authentication method.'
        );
      } else {
        const valid = await verifyPasswordScrypt(params.password, existingIdentity.passwordHash);
        if (valid) {
          uid = existing.uid;
        } else {
          throw new DomainSecurityError(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'This email is already registered. Please sign in with your password or use Google Sign-In.'
          );
        }
      }
    } else {
      uid = `usr_${crypto.randomBytes(12).toString('hex')}`;
      await tx.insert(users).values({
        uid,
        email,
        emailVerified: true,
        displayName: cleanName,
        authProvider: 'EMAIL_PASSWORD',
        accountStatus: 'ACTIVE',
      });

      await tx.insert(authIdentities).values({
        userUid: uid,
        provider: 'EMAIL_PASSWORD',
        providerSubject: email,
        email,
        emailVerified: true,
        passwordHash,
        lastLoginAt: new Date(),
      });
    }
  });

  return createOpaqueSessionTx(db, {
    userUid: uid,
    authMethod: 'EMAIL_PASSWORD',
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    rotateExistingSessions: true,
  });
}

export async function loginEmailPasswordUserTx(
  db: BloodSearchDatabase,
  params: {
    email: string;
    password: string;
    ipHash: string;
    userAgent: string;
  }
): Promise<IssuedOpaqueSession> {
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '');
  if (!email || !password || password.length > 128) {
    throw new DomainSecurityError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const [identity] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, 'EMAIL_PASSWORD'),
        eq(authIdentities.providerSubject, email)
      )
    )
    .limit(1);

  const now = new Date();

  if (!identity) {
    // Check if user exists in users table (e.g. from Google or seed)
    const [existingUser] = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      await deriveScryptAsync(password, DUMMY_SALT);
      throw new DomainSecurityError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    } else {
      // Brand-new user who submitted on "Sign In" tab instead of "Create Account" tab:
      // If password has at least 6 characters, automatically create their account and log them in!
      if (password.length >= 6) {
        return registerEmailPasswordUserTx(db, {
          email,
          password,
          displayName: email.split('@')[0] || 'BloodSearch User',
          ipHash: params.ipHash,
          userAgent: params.userAgent,
        });
      }
    }

    throw new DomainSecurityError(401, 'INVALID_CREDENTIALS', 'Invalid email or password. Password must be at least 6 characters.');
  }

  if (identity.lockedUntil && identity.lockedUntil.getTime() > now.getTime()) {
    const waitSec = Math.ceil((identity.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new DomainSecurityError(
      429,
      'ACCOUNT_TEMPORARILY_LOCKED',
      `Too many failed sign-in attempts. Please wait ${waitSec}s before trying again.`
    );
  }

  const valid = await verifyPasswordScrypt(password, identity.passwordHash);
  if (!valid) {
    const nextFailures = identity.failedLoginCount + 1;
    const lockUntil =
      nextFailures >= LOGIN_LOCKOUT_THRESHOLD ? new Date(now.getTime() + LOGIN_LOCKOUT_MS) : null;
    await db
      .update(authIdentities)
      .set({
        failedLoginCount: nextFailures,
        lockedUntil: lockUntil,
        updatedAt: now,
      })
      .where(eq(authIdentities.id, identity.id));

    await writeAuditLog(db, {
      actorUid: identity.userUid,
      actorRole: 'USER',
      action: 'LOGIN_FAILED',
      targetEntityType: 'auth_identities',
      targetEntityId: hashIdentifier(email),
      outcome: 'DENIED',
      ipHash: params.ipHash,
    });
    throw new DomainSecurityError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  await db
    .update(authIdentities)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(authIdentities.id, identity.id));

  return createOpaqueSessionTx(db, {
    userUid: identity.userUid,
    authMethod: 'EMAIL_PASSWORD',
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    rotateExistingSessions: true,
  });
}

export async function requestPasswordResetTokenTx(
  db: BloodSearchDatabase,
  emailRaw: string,
  ipHash: string
): Promise<{ accepted: true; devResetToken?: string }> {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { accepted: true };
  }

  const [identity] = await db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, 'EMAIL_PASSWORD'), eq(authIdentities.providerSubject, email)))
    .limit(1);

  if (!identity) {
    // Always return identical success to block account enumeration
    return { accepted: true };
  }

  const rawResetToken = crypto.randomBytes(24).toString('base64url');
  const resetHash = sha256Hex(rawResetToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db
    .update(authIdentities)
    .set({
      passwordResetTokenHash: resetHash,
      passwordResetExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(authIdentities.id, identity.id));

  await writeAuditLog(db, {
    actorUid: identity.userUid,
    actorRole: 'USER',
    action: 'PASSWORD_RESET_REQUESTED',
    targetEntityType: 'auth_identities',
    targetEntityId: identity.id,
    outcome: 'SUCCESS',
    ipHash,
  });

  const isProd = process.env.NODE_ENV === 'production';
  return {
    accepted: true,
    ...(!isProd ? { devResetToken: rawResetToken } : {}),
  };
}

export async function confirmPasswordResetTokenTx(
  db: BloodSearchDatabase,
  rawToken: string,
  newPassword: string,
  ipHash: string
): Promise<void> {
  if (!rawToken || rawToken.length < 16) {
    throw new DomainSecurityError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired password reset token.');
  }
  validateStrongPassword(newPassword);

  const tokenHash = sha256Hex(rawToken);
  const now = new Date();

  const [identity] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.passwordResetTokenHash, tokenHash),
        gt(authIdentities.passwordResetExpiresAt, now)
      )
    )
    .limit(1);

  if (!identity) {
    throw new DomainSecurityError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired password reset token.');
  }

  const newHash = await hashPasswordScrypt(newPassword);
  await db
    .update(authIdentities)
    .set({
      passwordHash: newHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(authIdentities.id, identity.id));

  await revokeAllUserSessionsTx(db, identity.userUid, 'PASSWORD_RESET_COMPLETED');

  await writeAuditLog(db, {
    actorUid: identity.userUid,
    actorRole: 'USER',
    action: 'PASSWORD_RESET_COMPLETED',
    targetEntityType: 'auth_identities',
    targetEntityId: identity.id,
    outcome: 'SUCCESS',
    ipHash,
  });
}

// ============================================================================
// PHONE OTP SESSION LINKING IN NEON
// ============================================================================
export async function authenticateVerifiedPhoneInNeonTx(
  db: BloodSearchDatabase,
  params: {
    phoneE164: string;
    isDevSandbox: boolean;
    ipHash: string;
    userAgent: string;
  }
): Promise<IssuedOpaqueSession> {
  const phoneSubject = sha256Hex(`PHONE_SUB:${params.phoneE164}`);
  const maskedHint = maskBangladeshPhone(params.phoneE164);
  const now = new Date();
  let uid = '';

  await db.transaction(async (tx) => {
    const [existingIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, 'PHONE_OTP'),
          eq(authIdentities.providerSubject, phoneSubject)
        )
      )
      .limit(1);

    if (existingIdentity) {
      uid = existingIdentity.userUid;
      await tx
        .update(authIdentities)
        .set({ lastLoginAt: now, updatedAt: now })
        .where(eq(authIdentities.id, existingIdentity.id));
      return;
    }

    uid = params.isDevSandbox
      ? `dev_otp_${phoneSubject.slice(0, 18)}`
      : `usr_ph_${phoneSubject.slice(0, 18)}`;

    await tx
      .insert(users)
      .values({
        uid,
        email: null,
        emailVerified: !params.isDevSandbox,
        phoneHint: maskedHint,
        displayName: maskedHint ? `Donor (${maskedHint.slice(-4)})` : 'Verified Donor',
        authProvider: 'PHONE_OTP',
        accountStatus: 'ACTIVE',
      })
      .onConflictDoNothing({ target: users.uid });

    await tx.insert(authIdentities).values({
      userUid: uid,
      provider: 'PHONE_OTP',
      providerSubject: phoneSubject,
      email: null,
      emailVerified: false,
      lastLoginAt: now,
    });
  });

  return createOpaqueSessionTx(db, {
    userUid: uid,
    authMethod: 'PHONE_OTP',
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    rotateExistingSessions: true,
  });
}

// ============================================================================
// REQUEST SESSION + CSRF VERIFICATION MIDDLEWARE HELPER
// ============================================================================
export interface VerifiedRequestSession {
  actor: ResolvedActor;
  sessionId: string | null;
  authTransport: 'COOKIE' | 'BEARER' | 'TEST_OVERRIDE';
  csrfTokenHash?: string;
}

export async function verifyRequestSession(
  req: Request,
  db: BloodSearchDatabase,
  options?: {
    verifyActorOverride?: (token: string) => Promise<AuthenticatedActor | null>;
    enforceCsrfOnCookieMutation?: boolean;
  }
): Promise<VerifiedRequestSession | null> {
  const ipHash = extractHashedClientIp(req);
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  // 1. Support test-harness override for automated security tests
  if (bearerToken && options?.verifyActorOverride) {
    const overridden = await options.verifyActorOverride(bearerToken);
    if (!overridden) return null;
    const resolved = await resolveActorRole(db, {
      ...overridden,
      ipHash,
    });
    return {
      actor: resolved,
      sessionId: null,
      authTransport: 'TEST_OVERRIDE',
    };
  }

  // 2. Extract opaque session token from HttpOnly cookie OR Bearer header (Capacitor Android APK)
  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || '';
  const candidateToken = cookieToken || bearerToken;
  const authTransport: 'COOKIE' | 'BEARER' = cookieToken ? 'COOKIE' : 'BEARER';

  if (!candidateToken || !candidateToken.startsWith('bs_sess_') || candidateToken.length > 256) {
    return null;
  }

  const tokenHash = sha256Hex(candidateToken);
  const now = new Date();

  const [sessionRow] = await db
    .select({
      session: loginSessions,
      user: users,
    })
    .from(loginSessions)
    .innerJoin(users, eq(loginSessions.userUid, users.uid))
    .where(
      and(
        eq(loginSessions.sessionTokenHash, tokenHash),
        eq(loginSessions.isRevoked, false),
        gt(loginSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!sessionRow) {
    return null;
  }

  if (sessionRow.user.accountStatus !== 'ACTIVE') {
    await db
      .update(loginSessions)
      .set({ isRevoked: true, revokedReason: `ACCOUNT_${sessionRow.user.accountStatus}` })
      .where(eq(loginSessions.id, sessionRow.session.id));
    throw new DomainSecurityError(
      403,
      'ACCOUNT_SUSPENDED',
      'Your account has been suspended or deactivated.'
    );
  }

  // 3. Enforce session-bound CSRF token on cookie-authenticated state-changing requests
  const method = String(req.method || 'GET').toUpperCase();
  const isStateChanging = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (authTransport === 'COOKIE' && isStateChanging && options?.enforceCsrfOnCookieMutation !== false) {
    const headerCsrf = String(req.headers['x-csrf-token'] || '').trim();
    if (!headerCsrf) {
      throw new DomainSecurityError(
        403,
        'CSRF_TOKEN_MISSING',
        'Missing X-CSRF-Token header for cookie-authenticated state-changing request.'
      );
    }
    const providedHash = Buffer.from(sha256Hex(headerCsrf), 'hex');
    const expectedHash = Buffer.from(sessionRow.session.csrfTokenHash, 'hex');
    if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
      throw new DomainSecurityError(
        403,
        'CSRF_TOKEN_INVALID',
        'Invalid CSRF token for active session.'
      );
    }
  }

  // Opportunistic lastActiveAt touch (non-blocking if > 60s old)
  if (now.getTime() - sessionRow.session.lastActiveAt.getTime() > 60_000) {
    db.update(loginSessions)
      .set({ lastActiveAt: now })
      .where(eq(loginSessions.id, sessionRow.session.id))
      .catch(() => {});
  }

  const resolvedActor = await resolveActorRole(db, {
    uid: sessionRow.user.uid,
    email: sessionRow.user.email,
    emailVerified: sessionRow.user.emailVerified || sessionRow.session.authMethod === 'PHONE_OTP',
    displayName: sessionRow.user.displayName,
    photoUrl: sessionRow.user.photoUrl,
    ipHash,
  });

  return {
    actor: resolvedActor,
    sessionId: sessionRow.session.id,
    authTransport,
    csrfTokenHash: sessionRow.session.csrfTokenHash,
  };
}

export async function verifyRawSessionFromHeaders(
  req: IncomingMessage,
  db: BloodSearchDatabase | null
): Promise<{ uid: string | null; isAdmin: boolean }> {
  if (!db) return { uid: null, isAdmin: false };
  const cookies = parseCookieHeader(req.headers.cookie);
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const urlObj = new URL(String(req.url || '/'), 'http://localhost');
  const queryToken = urlObj.searchParams.get('token') || '';
  const token = cookies[SESSION_COOKIE_NAME] || bearerToken || queryToken;

  if (!token || !token.startsWith('bs_sess_')) {
    return { uid: null, isAdmin: false };
  }
  const tokenHash = sha256Hex(token);
  const [row] = await db
    .select({ session: loginSessions, user: users })
    .from(loginSessions)
    .innerJoin(users, eq(loginSessions.userUid, users.uid))
    .where(
      and(
        eq(loginSessions.sessionTokenHash, tokenHash),
        eq(loginSessions.isRevoked, false),
        gt(loginSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row || row.user.accountStatus !== 'ACTIVE') {
    return { uid: null, isAdmin: false };
  }
  const actor = await resolveActorRole(db, {
    uid: row.user.uid,
    email: row.user.email,
    emailVerified: row.user.emailVerified,
    displayName: row.user.displayName,
    ipHash: extractHashedClientIp(req),
  });
  return {
    uid: actor.uid,
    isAdmin: actor.role === 'SUPER_ADMIN' || actor.role === 'CO_ADMIN' || actor.role === 'MODERATOR',
  };
}

export async function logoutOpaqueSessionTx(
  db: BloodSearchDatabase,
  req: Request
): Promise<void> {
  const cookies = parseCookieHeader(req.headers.cookie);
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = cookies[SESSION_COOKIE_NAME] || bearerToken;
  if (!token || !token.startsWith('bs_sess_')) return;

  const tokenHash = sha256Hex(token);
  await db
    .update(loginSessions)
    .set({ isRevoked: true, revokedReason: 'USER_LOGOUT' })
    .where(eq(loginSessions.sessionTokenHash, tokenHash));
}

export async function issueCsrfTokenForExistingSessionTx(
  db: BloodSearchDatabase,
  sessionId: string
): Promise<string> {
  const csrfToken = `bs_csrf_${crypto.randomBytes(32).toString('base64url')}`;
  await db
    .update(loginSessions)
    .set({ csrfTokenHash: sha256Hex(csrfToken), lastActiveAt: new Date() })
    .where(eq(loginSessions.id, sessionId));
  return csrfToken;
}
