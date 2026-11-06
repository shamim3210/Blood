import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { ensureMainPostgresReady, type BloodSearchDatabase } from '../db/index';
import { evaluateNeonHealthAndLimits } from '../db/neonMonitor';
import {
  adminDeleteUserTx,
  claimCoAdminInviteCodeTx,
  createBloodRequestWithAlertsTx,
  createCoAdminInviteCodeTx,
  createCustomOwnerInviteLockTx,
  createScamReportTx,
  deleteAnnouncementAdminTx,
  deleteBloodRequestAdminOrOwnerTx,
  deleteCommunityMessageTx,
  deleteDirectChatRoomTx,
  deleteDirectMessageTx,
  deleteDonorProfileAdminOrSelfTx,
  deleteOwnerInviteLockTx,
  deleteOwnUserAndDonorAccountTx,
  deleteScamReportAdminTx,
  DomainSecurityError,
  escalateBloodRequestTx,
  expireStaleBloodRequestsTx,
  getAuthorizedDonorPrivateContactTx,
  getOrCreateDirectChatRoomTx,
  getPublicOptedInDonorContactTx,
  getUserFullAccount,
  isAdminRole,
  listActiveAnnouncements,
  listActiveLiveDonorTrips,
  listAdminsAdmin,
  listBloodInventory,
  listBloodRequestsPaginated,
  listCommunityMessages,
  listContactRequestsForActor,
  listDirectChatRoomsForActor,
  listDirectMessagesForRoom,
  listEmergencyAlertsForActor,
  listGratitudeNotes,
  listHospitalsByDistrict,
  listNotificationsForActor,
  listOwnerInviteLocksTx,
  listScamReportsAdmin,
  listUsersAdmin,
  manageAdminRoleTx,
  markNotificationsReadTx,
  postCommunityMessageTx,
  postDirectMessageTx,
  postGratitudeNoteTx,
  publishAnnouncementAdminTx,
  queryAuditLogsPaginated,
  recordLoginSessionTx,
  recordManualDonationTx,
  requestDonorContactConsentTx,
  resolveScamReportAdminTx,
  respondDonorContactConsentTx,
  respondToBloodRequestTx,
  retryFailedNotificationsAndAlertsTx,
  searchPublicDonorsPaginated,
  seedBaselineHospitalsAndInventoryIfEmptyTx,
  toggleCommunityMessageReactionTx,
  toggleOwnerInviteLockTx,
  transitionBloodRequestStateTx,
  updateBloodInventoryTx,
  updateDonorVerificationAdminTx,
  updateLiveDonorTripStatusTx,
  updateUserAccountStatusAdminTx,
  updateUserAccountTx,
  upsertDeviceTokenTx,
  upsertLiveDonorTripTx,
  upsertUserAndDonorProfileTx,
  verifyOrClaimOwnerVaultInviteCodeTx,
  writeAuditLog,
  zeroSlateOperationalResetAdminTx,
  type AuthenticatedActor,
  type ResolvedActor,
} from '../db/repositories/bloodSearchRepo';
import {
  ADMIN_SESSION_TTL_MS,
  authenticateGoogleClaimsInNeonTx,
  authenticateVerifiedPhoneInNeonTx,
  clearOpaqueSessionCookie,
  confirmPasswordResetTokenTx,
  consumeGoogleOidcNonceTx,
  createOpaqueSessionTx,
  extractHashedClientIp,
  issueCsrfTokenForExistingSessionTx,
  issueGoogleOidcNonceTx,
  loginEmailPasswordUserTx,
  logoutOpaqueSessionTx,
  registerEmailPasswordUserTx,
  requestPasswordResetTokenTx,
  SESSION_TTL_MS,
  setOpaqueSessionCookie,
  verifyGoogleOidcIdToken,
  resolveTrustedClientIp,
  verifyRawSessionFromHeaders,
  verifyRequestSession,
} from './authAndSessionService';
import { enforceDistributedRateLimit } from './distributedRateLimiter';
import { BloodSearchOtpService, type OtpServiceOptions } from './otpService';
import { realtimeHub } from './realtimeHub';

export interface NeonApiRouterOptions {
  verifyActorOverride?: (token: string) => Promise<AuthenticatedActor | null>;
  otpService?: BloodSearchOtpService;
  otpServiceOptions?: OtpServiceOptions;
}

function firstConfiguredGoogleCredential(...values: Array<string | undefined>): string {
  return (
    values
      .map((value) => String(value || '').trim())
      .find((value) => value && !/^(YOUR_|GENERATE_|REPLACE_|CHANGE_ME|PLACEHOLDER)/i.test(value)) ||
    ''
  );
}

export function resolveGoogleOauthClientId(): string {
  return firstConfiguredGoogleCredential(
    process.env.GOOGLE_CLIENT_ID ||
      undefined,
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.OAUTH_CLIENT_ID
  );
}

export function resolveGoogleOauthClientSecret(): string {
  return firstConfiguredGoogleCredential(
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_CLIENT_SECRET
  );
}

/** Authentication sandbox is opt-in for local non-production development only. */
function isAuthSandboxEnabled(): boolean {
  const isProductionDeployment =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  return !isProductionDeployment && process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX === 'true';
}

export function resolveAppCallbackRedirectUri(req: Request): string {
  // OAuth redirect URIs must come from deployment configuration, never from
  // an arbitrary query parameter (otherwise an attacker can redirect auth
  // codes to an origin they control).
  const configuredOrigins = new Set<string>();
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl) {
    try {
      configuredOrigins.add(new URL(appUrl).origin);
    } catch {
      throw new Error('APP_URL must be a valid absolute URL.');
    }
  }
  for (const raw of (process.env.CORS_ALLOWED_ORIGINS || '').split(',')) {
    const candidate = raw.trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        configuredOrigins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed optional CORS entries; CORS setup validates separately.
    }
  }

  const requestOrigin = String(req.headers.origin || '').trim();
  if (requestOrigin) {
    try {
      const parsed = new URL(requestOrigin);
      if (configuredOrigins.has(parsed.origin)) return `${parsed.origin}/auth/callback`;
    } catch {
      // Fall through to the explicitly configured canonical APP_URL.
    }
  }

  if (appUrl) return `${new URL(appUrl).origin}/auth/callback`;

  // Local development only: do not infer a production redirect from Host or
  // X-Forwarded-Host headers, which are request-controlled in some setups.
  const isProductionDeployment =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProductionDeployment) {
    throw new Error('APP_URL must be configured for production Google OAuth.');
  }
  const proto = req.secure ? 'https' : 'http';
  const host = String(req.headers.host || 'localhost:3000').trim();
  if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) {
    throw new Error('A configured APP_URL is required for non-local OAuth redirects.');
  }
  return `${proto}://${host}/auth/callback`;
}

/**
 * Dedicated Express `/api/v1` router backed exclusively by Neon PostgreSQL + Drizzle ORM.
 * Enforces:
 *  - Google OIDC RS256 verification + single-use nonce replay protection
 *  - Scrypt Email/Password & Bangladesh Phone OTP with Neon SHA-256 opaque sessions
 *  - Session-bound CSRF tokens on cookie-authenticated mutations
 *  - Distributed PostgreSQL rate limiting (`rate_limit_buckets`)
 *  - Strict separation of public donor profiles vs `private_contacts`
 *  - Server-authoritative RBAC & IDOR protection + immutable `audit_logs`
 */
export function createNeonApiRouter(options?: NeonApiRouterOptions): Router {
  const router = Router();
  const otpService = options?.otpService || new BloodSearchOtpService(options?.otpServiceOptions);
  let seededHospitalsOnce = false;

  const extractRawClientIp = (req: Request): string =>
    resolveTrustedClientIp(req.headers, req.socket?.remoteAddress);

  const requireDatabase = async (res: Response): Promise<BloodSearchDatabase | null> => {
    const { db } = await ensureMainPostgresReady();
    if (!db) {
      res.status(503).json({
        ok: false,
        code: 'NEON_DATABASE_UNCONFIGURED',
        message: 'Primary Neon PostgreSQL database is temporarily unavailable.',
      });
      return null;
    }
    return db;
  };

  const requireAuthenticatedActor = async (
    req: Request,
    res: Response,
    db: BloodSearchDatabase,
    enforceCsrf = true
  ): Promise<ResolvedActor | null> => {
    const verified = await verifyRequestSession(req, db, {
      verifyActorOverride: options?.verifyActorOverride,
      enforceCsrfOnCookieMutation: enforceCsrf,
    });
    if (!verified) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHENTICATED',
        message: 'Valid authenticated session is required.',
      });
      return null;
    }
    return verified.actor;
  };

  const handleRouteError = (res: Response, err: unknown) => {
    if (err instanceof DomainSecurityError) {
      res.status(err.httpStatus).json({
        ok: false,
        code: err.code,
        message: err.message,
      });
      return;
    }
    console.error(
      '[NeonApiRouter] Unhandled database/API error:',
      err instanceof Error ? err.name : 'UnknownError'
    );
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_DATABASE_ERROR',
      message: 'An unexpected server error occurred while processing the request.',
    });
  };

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ==========================================================================
  // 0. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // ==========================================================================
  router.get('/events/stream', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `sse:${ipHash}`, 30, 60_000))) return;

    const identity = await verifyRawSessionFromHeaders(req, db);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const unregister = realtimeHub.registerSseClient(res, identity);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        unregister();
      }
    }, 25_000);
    keepAlive.unref?.();

    req.on('close', () => {
      clearInterval(keepAlive);
      unregister();
    });
  });

  // ==========================================================================
  // 1. AUTHENTICATION, GOOGLE OIDC, EMAIL/PASSWORD, PHONE OTP & SESSION LIFECYCLE
  // ==========================================================================
  router.get('/auth/config', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `authcfg:${ipHash}`, 60, 60_000))) return;

    const googleClientId = resolveGoogleOauthClientId();
    const googleClientSecret = resolveGoogleOauthClientSecret();

    res.json({
      ok: true,
      googleClientId: googleClientId || null,
      googleClientIdConfigured: Boolean(googleClientId),
      googleOauthPopupConfigured: Boolean(googleClientId && googleClientSecret),
      emailPasswordEnabled: true,
      otpCapabilities: otpService.getPublicCapabilities(),
      csrfRequired: true,
    });
  });

  router.post('/auth/google/nonce', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `gnonce:${ipHash}`, 20, 60_000))) return;

    try {
      const issued = await issueGoogleOidcNonceTx(
        db,
        ipHash,
        req.body?.redirectOrigin ? String(req.body.redirectOrigin) : undefined
      );
      res.json({ ok: true, ...issued });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/auth/google/url', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `gurl:${ipHash}`, 20, 60_000))) return;

    try {
      const clientId = resolveGoogleOauthClientId();
      const clientSecret = resolveGoogleOauthClientSecret();
      const redirectUri = resolveAppCallbackRedirectUri(req);
      const { nonce, state } = await issueGoogleOidcNonceTx(db, ipHash, redirectUri);

      if (!clientId || !clientSecret) {
        if (isAuthSandboxEnabled()) {
          const sandboxParams = new URLSearchParams({
            redirect_uri: redirectUri,
            nonce,
            state,
          });
          res.json({
            ok: true,
            url: `/auth/google-sandbox?${sandboxParams.toString()}`,
            redirectUri,
            isSandbox: true,
          });
          return;
        }
        res.status(503).json({
          ok: false,
          code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
          message: 'Google Sign-In is unavailable because the server OAuth credentials are not configured.',
        });
        return;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        prompt: 'select_account',
        nonce,
        state,
      });

      res.json({
        ok: true,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri,
        isSandbox: false,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/google/sandbox-login', async (req: Request, res: Response) => {
    if (!isAuthSandboxEnabled()) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND' });
      return;
    }
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `gsandbox:${ipHash}`, 20, 60_000))) return;

    try {
      const email = String(req.body?.email || 'test-user@example.invalid').trim().toLowerCase();
      const displayName = String(
        req.body?.displayName || (email.startsWith('shamim') ? 'Shamim Rakib' : email.split('@')[0])
      ).trim();

      const claims = {
        sub: `sandbox_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`,
        email,
        emailVerified: true,
        name: displayName,
        picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`,
      };

      const session = await authenticateGoogleClaimsInNeonTx(
        db,
        claims,
        ipHash,
        String(req.headers['user-agent'] || '')
      );

      const ttlMs = isAdminRole(session.actor.role) ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
      setOpaqueSessionCookie(req, res, session.sessionToken, ttlMs);
      const account = await getUserFullAccount(db, session.actor);

      res.json({
        ok: true,
        user: session.userProfile,
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: session.actor.role,
        csrfToken: session.csrfToken,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/google', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (
      !(await enforceDistributedRateLimit(res, db, `glogin:${ipHash}`, 12, 60_000, {
        blockDurationMs: 5 * 60_000,
      }))
    ) {
      return;
    }

    try {
      const idToken = String(req.body?.idToken || req.body?.credential || '').trim();
      const nonce = String(req.body?.nonce || '').trim();
      const expectedClientId = resolveGoogleOauthClientId();

      // 1. Verify RS256 JWKS signature, issuer, audience, expiration, email_verified, and nonce
      const claims = await verifyGoogleOidcIdToken({
        idToken,
        expectedClientId,
        expectedNonce: nonce,
      });

      // 2. Atomically consume single-use nonce in Neon to block replay attacks
      await consumeGoogleOidcNonceTx(db, nonce);

      // 3. Link/create user in Neon & mint rotated SHA-256 opaque session
      const session = await authenticateGoogleClaimsInNeonTx(
        db,
        claims,
        ipHash,
        String(req.headers['user-agent'] || '')
      );

      const ttlMs = isAdminRole(session.actor.role) ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
      setOpaqueSessionCookie(req, res, session.sessionToken, ttlMs);

      const account = await getUserFullAccount(db, session.actor);

      res.json({
        ok: true,
        user: session.userProfile,
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: session.actor.role,
        csrfToken: session.csrfToken,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/register', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (
      !(await enforceDistributedRateLimit(res, db, `authreg:${ipHash}`, 8, 10 * 60_000, {
        blockDurationMs: 10 * 60_000,
      }))
    ) {
      return;
    }

    try {
      const session = await registerEmailPasswordUserTx(db, {
        email: String(req.body?.email || ''),
        password: String(req.body?.password || ''),
        displayName: String(req.body?.displayName || req.body?.name || ''),
        ipHash,
        userAgent: String(req.headers['user-agent'] || ''),
      });

      setOpaqueSessionCookie(req, res, session.sessionToken, SESSION_TTL_MS);
      const account = await getUserFullAccount(db, session.actor);

      res.status(201).json({
        ok: true,
        user: session.userProfile,
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: session.actor.role,
        csrfToken: session.csrfToken,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (
      !(await enforceDistributedRateLimit(res, db, `authlogin:${ipHash}`, 10, 5 * 60_000, {
        blockDurationMs: 10 * 60_000,
      }))
    ) {
      return;
    }

    try {
      const session = await loginEmailPasswordUserTx(db, {
        email: String(req.body?.email || ''),
        password: String(req.body?.password || ''),
        ipHash,
        userAgent: String(req.headers['user-agent'] || ''),
      });

      const ttlMs = isAdminRole(session.actor.role) ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
      setOpaqueSessionCookie(req, res, session.sessionToken, ttlMs);
      const account = await getUserFullAccount(db, session.actor);

      res.json({
        ok: true,
        user: session.userProfile,
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: session.actor.role,
        csrfToken: session.csrfToken,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/password-reset/request', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `pwresetreq:${ipHash}`, 5, 15 * 60_000))) return;

    try {
      const outcome = await requestPasswordResetTokenTx(db, String(req.body?.email || ''), ipHash);
      res.json({
        ok: true,
        ...outcome,
        message: 'If an account matches that email, password recovery instructions have been issued.',
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/password-reset/confirm', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `pwresetcfm:${ipHash}`, 8, 15 * 60_000))) return;

    try {
      await confirmPasswordResetTokenTx(
        db,
        String(req.body?.token || ''),
        String(req.body?.newPassword || req.body?.password || ''),
        ipHash
      );
      clearOpaqueSessionCookie(req, res);
      res.json({
        ok: true,
        message: 'Password updated and all prior sessions revoked. Please sign in with your new password.',
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/auth/otp/config', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      ...otpService.getPublicCapabilities(),
    });
  });

  router.post('/auth/otp/send', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `otpsend:${ipHash}`, 8, 10 * 60_000))) return;

    const outcome = await otpService.requestOtp({
      rawPhone: String(req.body?.phone || '').slice(0, 32),
      clientIp: extractRawClientIp(req),
      preferDevSandbox: req.body?.preferDevSandbox === true,
    });
    res.status(outcome.httpStatus).json(outcome.body);
  });

  router.post('/auth/otp/verify', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `otpverify:${ipHash}`, 12, 10 * 60_000))) return;

    try {
      const outcome = otpService.verifyOtp({
        challengeId: String(req.body?.challengeId || '').slice(0, 80),
        rawPhone: String(req.body?.phone || '').slice(0, 32),
        otpCode: String(req.body?.otp || '').slice(0, 12),
        clientIp: extractRawClientIp(req),
      });

      if (!outcome.body.ok || !outcome.body.phoneE164) {
        res.status(outcome.httpStatus).json(outcome.body);
        return;
      }

      const session = await authenticateVerifiedPhoneInNeonTx(db, {
        phoneE164: outcome.body.phoneE164,
        isDevSandbox: outcome.body.deliveryMode === 'DEV_SANDBOX',
        ipHash,
        userAgent: String(req.headers['user-agent'] || ''),
      });

      setOpaqueSessionCookie(req, res, session.sessionToken, SESSION_TTL_MS);
      const account = await getUserFullAccount(db, session.actor);

      res.status(200).json({
        ...outcome.body,
        user: session.userProfile,
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: session.actor.role,
        csrfToken: session.csrfToken,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/auth/me', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `authme:${ipHash}`, 90, 60_000))) return;

    if (!db) {
      res.json({ ok: true, authenticated: false, user: null, role: 'GUEST' });
      return;
    }

    try {
      const verified = await verifyRequestSession(req, db, {
        verifyActorOverride: options?.verifyActorOverride,
        enforceCsrfOnCookieMutation: false,
      });

      if (!verified) {
        res.json({ ok: true, authenticated: false, user: null, role: 'GUEST' });
        return;
      }

      const account = await getUserFullAccount(db, verified.actor);
      const rotateCsrf = req.query.refreshCsrf === '1' && verified.sessionId;
      const csrfToken =
        rotateCsrf && verified.sessionId
          ? await issueCsrfTokenForExistingSessionTx(db, verified.sessionId)
          : undefined;

      res.json({
        ok: true,
        authenticated: true,
        user: account.user
          ? {
              uid: account.user.uid,
              email: account.user.email,
              emailVerified: account.user.emailVerified,
              phoneHint: account.user.phoneHint,
              displayName: account.user.displayName,
              photoUrl: account.user.photoUrl,
              bloodGroup: account.user.bloodGroup,
              district: account.user.district,
              area: account.user.area,
              preferredLanguage: account.user.preferredLanguage,
              familyCircleJson: account.user.familyCircleJson,
              authProvider: account.user.authProvider,
              accountStatus: account.user.accountStatus,
              role: verified.actor.role,
            }
          : {
              uid: verified.actor.uid,
              email: verified.actor.email,
              emailVerified: verified.actor.emailVerified,
              displayName: verified.actor.displayName || 'Member',
              photoUrl: verified.actor.photoUrl || null,
              role: verified.actor.role,
            },
        donorProfile: account.donorProfile,
        privateContact: account.privateContact,
        donations: account.donations,
        role: verified.actor.role,
        isAdmin: isAdminRole(verified.actor.role),
        isSuperAdmin: verified.actor.role === 'SUPER_ADMIN',
        ...(csrfToken ? { csrfToken } : {}),
      });
    } catch (err) {
      if (err instanceof DomainSecurityError && err.code === 'ACCOUNT_SUSPENDED') {
        clearOpaqueSessionCookie(req, res);
      }
      handleRouteError(res, err);
    }
  });

  router.post('/auth/logout', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `authlogout:${ipHash}`, 30, 60_000))) return;

    try {
      if (db) {
        // Verify CSRF if an active cookie session exists before revoking
        const verified = await verifyRequestSession(req, db, {
          verifyActorOverride: options?.verifyActorOverride,
          enforceCsrfOnCookieMutation: true,
        });
        if (verified) {
          await logoutOpaqueSessionTx(db, req);
          await writeAuditLog(db, {
            actorUid: verified.actor.uid,
            actorRole: verified.actor.role,
            action: 'SESSION_LOGOUT',
            targetEntityType: 'login_sessions',
            targetEntityId: verified.sessionId || verified.actor.uid,
            outcome: 'SUCCESS',
            ipHash,
          });
        }
      }
      clearOpaqueSessionCookie(req, res);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 2. NEON DATABASE HEALTH & ADMIN CONSOLE VERIFICATION
  // ==========================================================================
  router.get('/db/health', async (req: Request, res: Response) => {
    const { db, info } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `dbhealth:${ipHash}`, 30, 60_000))) return;

    try {
      const report = await evaluateNeonHealthAndLimits(db, info);
      let isAdmin = false;
      if (db) {
        const verified = await verifyRequestSession(req, db, {
          verifyActorOverride: options?.verifyActorOverride,
          enforceCsrfOnCookieMutation: false,
        });
        if (verified) {
          isAdmin = isAdminRole(verified.actor.role);
        }
      }

      if (!isAdmin) {
        res.json({
          ok: report.status === 'HEALTHY' || report.status === 'WARNING',
          status: report.status,
          cutoverMode: report.cutoverMode,
          configured: report.connection.configured,
          activeGeoStrategy: report.capabilities.activeGeoStrategy,
          checkedAtIso: report.checkedAtIso,
        });
        return;
      }

      res.json({ ok: true, report });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/auth/admin-verify', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (
      !(await enforceDistributedRateLimit(res, db, `adminverify:${ipHash}`, 12, 5 * 60_000, {
        blockDurationMs: 15 * 60_000,
        code: 'ADMIN_BRUTE_FORCE_LOCKED',
      }))
    ) {
      return;
    }

    try {
      const verified = await verifyRequestSession(req, db, {
        verifyActorOverride: options?.verifyActorOverride,
        enforceCsrfOnCookieMutation: false,
      });

      if (!verified) {
        res.status(401).json({
          ok: false,
          isAdmin: false,
          code: 'UNAUTHENTICATED',
          message: 'Valid authenticated session is required.',
        });
        return;
      }

      const actor = verified.actor;
      const granted = isAdminRole(actor.role);

      if (!granted) {
        if (
          !(await enforceDistributedRateLimit(
            res,
            db,
            `adminverify_fail:${actor.uid}:${ipHash}`,
            5,
            15 * 60_000,
            {
              blockDurationMs: 15 * 60_000,
              code: 'ADMIN_BRUTE_FORCE_LOCKED',
            }
          ))
        ) {
          return;
        }
        await writeAuditLog(db, {
          actorUid: actor.uid,
          actorRole: actor.role,
          action: 'ADMIN_CONSOLE_UNAUTHORIZED_ATTEMPT',
          targetEntityType: 'admin_roles',
          targetEntityId: actor.uid,
          outcome: 'DENIED',
          ipHash,
        });
        res.status(200).json({
          ok: true,
          isAdmin: false,
          isSuperAdmin: false,
          role: 'USER',
          code: 'FORBIDDEN_ADMIN_ONLY',
          message: 'Account is not authorized for Admin Console access.',
        });
        return;
      }

      await writeAuditLog(db, {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: 'ADMIN_CONSOLE_VERIFIED',
        targetEntityType: 'admin_roles',
        targetEntityId: actor.uid,
        outcome: 'SUCCESS',
        ipHash,
      });

      res.json({
        ok: true,
        isAdmin: true,
        isSuperAdmin: actor.role === 'SUPER_ADMIN',
        role: actor.role,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 3. USER PROFILE, FAMILY CIRCLE & MANUAL DONATION LOGGING
  // ==========================================================================
  router.get('/users/me', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `userme:${ipHash}`, 60, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const account = await getUserFullAccount(db, actor);
      res.json({ ok: true, ...account });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.patch('/users/me', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `userpatch:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updated = await updateUserAccountTx(db, actor, {
        displayName: req.body?.displayName,
        photoUrl: req.body?.photoUrl,
        bloodGroup: req.body?.bloodGroup,
        district: req.body?.district,
        area: req.body?.area,
        preferredLanguage: req.body?.preferredLanguage,
        familyCircleJson: req.body?.familyCircleJson,
      });
      res.json({ ok: true, user: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/users/me/donations', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `userdon:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const created = await recordManualDonationTx(db, actor, {
        hospitalName: String(req.body?.hospitalName || ''),
        bloodGroup: String(req.body?.bloodGroup || ''),
        unitsDonated: req.body?.unitsDonated !== undefined ? Number(req.body.unitsDonated) : 1,
        donatedAt: req.body?.donatedAt,
        notes: req.body?.notes ? String(req.body.notes) : undefined,
      });

      realtimeHub.emitEvent('donors:updated', 'public:donors', { uid: actor.uid });
      res.status(201).json({ ok: true, donation: created });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/users/me', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `userdel:${ipHash}`, 5, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteOwnUserAndDonorAccountTx(db, actor);
      clearOpaqueSessionCookie(req, res);
      realtimeHub.emitEvent('donors:deleted', 'public:donors', { donorId: actor.uid });
      res.json({ ok: true, deleted: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 4. PUBLIC PAGINATED DONOR SEARCH, DONOR CRUD & PROTECTED PRIVATE CONTACTS
  // ==========================================================================
  router.get('/donors/search', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `donorsearch:${ipHash}`, 60, 60_000))) return;

    try {
      if (!db) {
        const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
        const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
        res.json({
          ok: true,
          dbConfigured: false,
          items: [],
          pagination: {
            page,
            limit,
            totalItems: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: page > 1,
          },
          geoStrategy: 'NONE',
        });
        return;
      }

      const result = await searchPublicDonorsPaginated(db, {
        bloodGroup: req.query.bloodGroup ? String(req.query.bloodGroup) : undefined,
        includeCompatible: req.query.includeCompatible === 'true',
        district: req.query.district ? String(req.query.district) : undefined,
        areaQuery: req.query.q ? String(req.query.q) : undefined,
        availableOnly: req.query.availableOnly !== 'false',
        latitude: req.query.lat !== undefined ? Number(req.query.lat) : undefined,
        longitude: req.query.lng !== undefined ? Number(req.query.lng) : undefined,
        radiusKm: req.query.radiusKm !== undefined ? Number(req.query.radiusKm) : undefined,
        page: req.query.page !== undefined ? Number(req.query.page) : 1,
        limit: req.query.limit !== undefined ? Number(req.query.limit) : 20,
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof DomainSecurityError) {
        handleRouteError(res, err);
        return;
      }
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
      res.status(200).json({
        ok: true,
        dbConfigured: false,
        degraded: true,
        items: [],
        pagination: {
          page,
          limit,
          totalItems: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: page > 1,
        },
        geoStrategy: 'NONE',
      });
    }
  });

  router.post('/donors/profile', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `donorupsert:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const body = req.body || {};
      const targetUid = body.targetUid ? String(body.targetUid) : actor.uid;

      const profile = await upsertUserAndDonorProfileTx(db, actor, {
        targetUid,
        displayName: body.displayName,
        bloodGroup: body.bloodGroup,
        age: body.age ?? null,
        gender: body.gender ?? null,
        weightKg: body.weightKg ?? null,
        district: body.district,
        upazila: body.upazila ?? null,
        area: body.area,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        phone: body.phone,
        whatsappNumber: body.whatsappNumber ?? null,
        facebookProfileUrl: body.facebookProfileUrl ?? body.facebookUrl ?? null,
        exactStreetAddress: body.exactStreetAddress ?? null,
        isAvailable: body.isAvailable,
        availabilityStatus: body.availabilityStatus,
        dndUntil: body.dndUntil ?? null,
        lastDonationDate: body.lastDonationDate ?? null,
        avatarUrl: body.avatarUrl ?? null,
        shareDirectContact: body.shareDirectContact,
        contactPreference: body.contactPreference,
        contactVisibility: body.contactVisibility,
        medicalDeclarationAccepted: body.medicalDeclarationAccepted !== false,
        bio: body.bio ?? null,
      });

      realtimeHub.emitEvent('donors:updated', 'public:donors', { donorId: profile.id });
      res.status(201).json({ ok: true, profile });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/donors/:donorUid', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `donordel:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteDonorProfileAdminOrSelfTx(db, actor, String(req.params.donorUid || ''));
      realtimeHub.emitEvent('donors:deleted', 'public:donors', { donorId: req.params.donorUid });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/donors/:donorUid/verify', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `donorver:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updated = await updateDonorVerificationAdminTx(
        db,
        actor,
        String(req.params.donorUid || ''),
        Boolean(req.body?.isVerified)
      );
      realtimeHub.emitEvent('donors:updated', 'public:donors', { donorId: updated.id });
      res.json({ ok: true, profile: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/donors/:donorUid/opted-in-contact', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `optincontact:${ipHash}`, 20, 60_000))) return;

    const silentFrontendProbe = req.query.silent === '1';

    try {
      if (!db) {
        res.json({ ok: false, dbConfigured: false, found: false, contact: null });
        return;
      }

      const contact = await getPublicOptedInDonorContactTx(
        db,
        String(req.params.donorUid || ''),
        ipHash
      );
      res.json({
        ok: true,
        contact: {
          ...contact,
          facebookUrl: contact.facebookProfileUrl,
        },
      });
    } catch (err) {
      if (err instanceof DomainSecurityError) {
        if (err.code === 'DONOR_CONTACT_NOT_FOUND') {
          res.json({ ok: false, found: false, contact: null });
          return;
        }
        if (silentFrontendProbe && err.httpStatus === 403) {
          res.json({ ok: false, restricted: true, code: err.code, contact: null });
          return;
        }
        handleRouteError(res, err);
        return;
      }
      if (silentFrontendProbe) {
        res.status(200).json({ ok: false, degraded: true, contact: null });
        return;
      }
      handleRouteError(res, err);
    }
  });

  router.get('/donors/:donorUid/contact', async (req: Request, res: Response) => {
    const { db } = await ensureMainPostgresReady();
    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `contactunmask:${ipHash}`, 12, 60_000))) return;

    const silentFrontendProbe = req.query.silent === '1';

    try {
      if (!db) {
        if (silentFrontendProbe) {
          res.json({ ok: false, dbConfigured: false, found: false, contact: null });
          return;
        }
        res.status(503).json({
          ok: false,
          code: 'NEON_DATABASE_UNCONFIGURED',
          message: 'Primary PostgreSQL database is temporarily unavailable.',
        });
        return;
      }

      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      if (!(await enforceDistributedRateLimit(res, db, `contactunmask:uid:${actor.uid}`, 10, 60_000))) return;

      const contact = await getAuthorizedDonorPrivateContactTx(
        db,
        actor,
        String(req.params.donorUid || ''),
        req.query.requestId ? String(req.query.requestId) : undefined
      );

      res.json({ ok: true, contact });
    } catch (err) {
      if (silentFrontendProbe && err instanceof DomainSecurityError) {
        if (err.code === 'DONOR_CONTACT_NOT_FOUND' || err.httpStatus === 403) {
          res.json({ ok: false, restricted: err.httpStatus === 403, code: err.code, contact: null });
          return;
        }
      }
      if (silentFrontendProbe && !(err instanceof DomainSecurityError)) {
        res.status(200).json({ ok: false, degraded: true, contact: null });
        return;
      }
      handleRouteError(res, err);
    }
  });

  router.post(
    ['/donors/:donorUid/contact-request', '/donors/:donorUid/contact-requests'],
    async (req: Request, res: Response) => {
      const db = await requireDatabase(res);
      if (!db) return;

      const ipHash = extractHashedClientIp(req);
      if (!(await enforceDistributedRateLimit(res, db, `contactreq:${ipHash}`, 10, 60_000))) return;

      try {
        const actor = await requireAuthenticatedActor(req, res, db);
        if (!actor) return;
        if (!(await enforceDistributedRateLimit(res, db, `contactreq:uid:${actor.uid}`, 8, 60_000))) return;

        const consent = await requestDonorContactConsentTx(
          db,
          actor,
          String(req.params.donorUid || ''),
          String(req.body?.reason || ''),
          req.body?.requestId ? String(req.body.requestId) : undefined
        );

        realtimeHub.emitEvent('notifications:new', `user:${consent.userUid}`, {
          consentId: consent.id,
        });
        res.status(201).json({ ok: true, consent });
      } catch (err) {
        handleRouteError(res, err);
      }
    }
  );

  router.get('/consents', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `consentslist:${ipHash}`, 30, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listContactRequestsForActor(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/consents/:consentId/respond', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `consentresp:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const decision =
        req.body?.decision === 'GRANTED' || req.body?.decision === 'APPROVED' ? 'GRANTED' : 'REVOKED';
      const updated = await respondDonorContactConsentTx(
        db,
        actor,
        String(req.params.consentId || ''),
        decision
      );

      if (updated.counterpartyUid) {
        realtimeHub.emitEvent('notifications:new', `user:${updated.counterpartyUid}`, {
          consentId: updated.id,
          status: updated.status,
        });
      }
      res.json({ ok: true, consent: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 5. BLOOD REQUESTS, SOS ALERTS, NOTIFICATIONS & LIVE DONOR GPS TRIPS
  // ==========================================================================
  router.get('/requests', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqlist:${ipHash}`, 60, 60_000))) return;

    try {
      const verified = await verifyRequestSession(req, db, {
        verifyActorOverride: options?.verifyActorOverride,
        enforceCsrfOnCookieMutation: false,
      });
      const optionalActor = verified ? verified.actor : null;

      const data = await listBloodRequestsPaginated(db, optionalActor, {
        bloodGroup: req.query.bloodGroup ? String(req.query.bloodGroup) : undefined,
        district: req.query.district ? String(req.query.district) : undefined,
        status: req.query.status ? String(req.query.status) : 'ACTIVE',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });

      res.json({ ok: true, ...data });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/requests', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqcreate:${ipHash}`, 8, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      if (!(await enforceDistributedRateLimit(res, db, `reqcreate:uid:${actor.uid}`, 5, 60_000))) return;

      const body = req.body || {};
      const outcome = await createBloodRequestWithAlertsTx(db, actor, {
        patientName: body.patientName,
        bloodGroup: body.bloodGroup,
        bagsNeeded: Number(body.bagsNeeded ?? body.unitsNeeded ?? 1),
        urgency: body.urgency || 'CRITICAL',
        hospitalId: body.hospitalId ?? null,
        hospitalName: body.hospitalName,
        district: body.district,
        area: body.area || body.upazila || body.district,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        clinicalReason: body.clinicalReason ?? body.medicalReason ?? body.notes ?? null,
        contactName: body.contactName ?? null,
        contactPhone: body.contactPhone,
        shareDirectContact: body.shareDirectContact !== false,
      });

      realtimeHub.emitEvent('requests:created', 'public:requests', {
        requestId: outcome.request.id,
        bloodGroup: outcome.request.bloodGroup,
        district: outcome.request.district,
      });
      for (const donorUid of outcome.notifiedDonorUids || []) {
        realtimeHub.emitEvent('alerts:sos', `user:${donorUid}`, {
          requestId: outcome.request.id,
          bloodGroup: outcome.request.bloodGroup,
        });
      }

      res.status(201).json({ ok: true, ...outcome });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/requests/:requestId/respond', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqresp:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const body = req.body || {};
      const response = await respondToBloodRequestTx(
        db,
        actor,
        String(req.params.requestId || ''),
        {
          responseStatus: body.responseStatus || 'ACCEPTED',
          etaMinutes: body.etaMinutes !== undefined ? Number(body.etaMinutes) : undefined,
          note: body.note ? String(body.note) : undefined,
        }
      );

      realtimeHub.emitEvent('requests:updated', 'public:requests', {
        requestId: req.params.requestId,
      });
      res.json({ ok: true, response });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/requests/:requestId/escalate', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqesc:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updatedRequest = await escalateBloodRequestTx(
        db,
        actor,
        String(req.params.requestId || '')
      );
      realtimeHub.emitEvent('requests:updated', 'public:requests', {
        requestId: updatedRequest.id,
        escalationLevel: updatedRequest.escalationLevel,
      });
      res.json({ ok: true, request: updatedRequest });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/requests/:requestId/transition', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqtrans:${ipHash}`, 12, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const body = req.body || {};
      const outcome = await transitionBloodRequestStateTx(
        db,
        actor,
        String(req.params.requestId || ''),
        {
          nextStatus: body.nextStatus,
          reason: body.reason ? String(body.reason) : undefined,
          fulfilledByDonorUid: body.fulfilledByDonorUid ? String(body.fulfilledByDonorUid) : undefined,
          unitsDonated: body.unitsDonated !== undefined ? Number(body.unitsDonated) : undefined,
        }
      );

      realtimeHub.emitEvent('requests:updated', 'public:requests', {
        requestId: req.params.requestId,
        status: body.nextStatus,
      });
      if (body.fulfilledByDonorUid) {
        realtimeHub.emitEvent('donors:updated', 'public:donors', {
          uid: body.fulfilledByDonorUid,
        });
      }
      res.json({ ok: true, ...outcome });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/requests/:requestId', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqdel:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const deleted = await deleteBloodRequestAdminOrOwnerTx(
        db,
        actor,
        String(req.params.requestId || '')
      );
      if (deleted) {
        realtimeHub.emitEvent('requests:updated', 'public:requests', {
          requestId: req.params.requestId,
          deleted: true,
        });
      }
      res.json({ ok: true, deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/alerts', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `alertslist:${ipHash}`, 40, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listEmergencyAlertsForActor(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/notifications', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `notifslist:${ipHash}`, 40, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listNotificationsForActor(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/notifications/read', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `notifsread:${ipHash}`, 40, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      await markNotificationsReadTx(
        db,
        actor,
        req.body?.notificationId ? String(req.body.notificationId) : undefined
      );
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/trips', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `tripslist:${ipHash}`, 60, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listActiveLiveDonorTrips(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/trips', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `tripsupsert:${ipHash}`, 60, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const trip = await upsertLiveDonorTripTx(db, actor, {
        requestId: String(req.body?.requestId || ''),
        currentLat: Number(req.body?.currentLat ?? req.body?.lat),
        currentLng: Number(req.body?.currentLng ?? req.body?.lng),
        hospitalLat: req.body?.hospitalLat !== undefined ? Number(req.body.hospitalLat) : undefined,
        hospitalLng: req.body?.hospitalLng !== undefined ? Number(req.body.hospitalLng) : undefined,
        etaMinutes: req.body?.etaMinutes !== undefined ? Number(req.body.etaMinutes) : undefined,
        distanceKm: req.body?.distanceKm !== undefined ? Number(req.body.distanceKm) : undefined,
        tripStatus: req.body?.tripStatus,
      });

      realtimeHub.emitEvent('trips:updated', 'public:trips', { tripId: trip.id });
      res.json({ ok: true, trip });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.patch('/trips/:tripId/status', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `tripstat:${ipHash}`, 40, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const rawStatus = String(req.body?.tripStatus || 'EN_ROUTE').toUpperCase();
      const nextStatus: 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'STOPPED' =
        rawStatus === 'ARRIVED'
          ? 'ARRIVED'
          : rawStatus === 'COMPLETED'
            ? 'COMPLETED'
            : rawStatus === 'CANCELLED' || rawStatus === 'STOPPED'
              ? 'STOPPED'
              : 'EN_ROUTE';

      const trip = await updateLiveDonorTripStatusTx(
        db,
        actor,
        String(req.params.tripId || ''),
        nextStatus
      );
      realtimeHub.emitEvent('trips:updated', 'public:trips', { tripId: trip.id });
      res.json({ ok: true, trip });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 6. COMMUNITY CHAT & DIRECT 1-TO-1 CHAT
  // ==========================================================================
  router.get('/chat/community', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `commget:${ipHash}`, 60, 60_000))) return;

    try {
      const items = await listCommunityMessages(
        db,
        req.query.district ? String(req.query.district) : undefined,
        req.query.limit ? Number(req.query.limit) : 60
      );
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/chat/community', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `commpost:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      if (!(await enforceDistributedRateLimit(res, db, `commpost:uid:${actor.uid}`, 15, 60_000))) return;

      const message = await postCommunityMessageTx(db, actor, {
        messageText: String(req.body?.messageText || req.body?.text || ''),
        district: req.body?.district ? String(req.body.district) : null,
        attachmentType: req.body?.attachmentType,
        attachmentJson: req.body?.attachmentJson || null,
        replyToId: req.body?.replyToId ? String(req.body.replyToId) : null,
        replyToName: req.body?.replyToName ? String(req.body.replyToName) : null,
        replyToText: req.body?.replyToText ? String(req.body.replyToText) : null,
      });

      realtimeHub.emitEvent('community:message', 'public:community', { message });
      res.status(201).json({ ok: true, message });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/chat/community/:messageId/react', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `commreact:${ipHash}`, 40, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updated = await toggleCommunityMessageReactionTx(
        db,
        actor,
        String(req.params.messageId || ''),
        String(req.body?.emoji || '')
      );
      realtimeHub.emitEvent('community:updated', 'public:community', { messageId: updated.id });
      res.json({ ok: true, message: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/chat/community/:messageId', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `commdel:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteCommunityMessageTx(db, actor, String(req.params.messageId || ''));
      realtimeHub.emitEvent('community:deleted', 'public:community', { messageId: req.params.messageId });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/chat/rooms', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roomsget:${ipHash}`, 50, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listDirectChatRoomsForActor(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/chat/rooms', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roomscreate:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const room = await getOrCreateDirectChatRoomTx(db, actor, String(req.body?.peerUid || ''), {
        peerName: req.body?.peerName ? String(req.body.peerName) : undefined,
        relatedRequestId: req.body?.relatedRequestId ? String(req.body.relatedRequestId) : undefined,
        hospitalName: req.body?.hospitalName ? String(req.body.hospitalName) : undefined,
      });

      res.status(201).json({ ok: true, room });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/chat/rooms/:roomId/messages', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roommsgs:${ipHash}`, 60, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;

      const items = await listDirectMessagesForRoom(db, actor, String(req.params.roomId || ''));
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/chat/rooms/:roomId/messages', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roomsend:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      if (!(await enforceDistributedRateLimit(res, db, `roomsend:uid:${actor.uid}`, 20, 60_000))) return;

      const { message, room } = await postDirectMessageTx(db, actor, String(req.params.roomId || ''), {
        messageText: String(req.body?.messageText || req.body?.text || ''),
        attachmentType: req.body?.attachmentType ? String(req.body.attachmentType) : null,
        metadataJson: req.body?.metadataJson || null,
      });

      const participants = [room.participantOneUid, room.participantTwoUid];
      realtimeHub.emitEvent(
        'direct:message',
        `room:${room.id}`,
        { roomId: room.id, message },
        participants
      );
      const recipientUid = room.participantOneUid === actor.uid ? room.participantTwoUid : room.participantOneUid;
      realtimeHub.emitEvent('notifications:new', `user:${recipientUid}`, {
        roomId: room.id,
      });

      res.status(201).json({ ok: true, message });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/chat/rooms/:roomId/messages/:messageId', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roommsgdel:${ipHash}`, 30, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const deleted = await deleteDirectMessageTx(
        db,
        actor,
        String(req.params.roomId || ''),
        String(req.params.messageId || '')
      );
      res.json({ ok: true, deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/chat/rooms/:roomId', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `roomdel:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const deleted = await deleteDirectChatRoomTx(db, actor, String(req.params.roomId || ''));
      res.json({ ok: true, deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 7. HOSPITALS, BLOOD BANKS, INVENTORY, ANNOUNCEMENTS, REPORTS & GRATITUDE
  // ==========================================================================
  router.get('/hospitals', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `hospitals:${ipHash}`, 60, 60_000))) return;

    try {
      if (!seededHospitalsOnce) {
        seededHospitalsOnce = true;
        await seedBaselineHospitalsAndInventoryIfEmptyTx(db).catch(() => {});
      }
      const items = await listHospitalsByDistrict(
        db,
        req.query.district ? String(req.query.district) : undefined
      );
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get(['/inventory', '/blood-inventory'], async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `invlist:${ipHash}`, 60, 60_000))) return;

    try {
      if (!seededHospitalsOnce) {
        seededHospitalsOnce = true;
        await seedBaselineHospitalsAndInventoryIfEmptyTx(db).catch(() => {});
      }
      const items = await listBloodInventory(
        db,
        req.query.district ? String(req.query.district) : undefined
      );
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/announcements', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `annlist:${ipHash}`, 60, 60_000))) return;

    try {
      const rawType = req.query.type ? String(req.query.type).toUpperCase() : undefined;
      const announcementType =
        rawType === 'BROADCAST' || rawType === 'OTA_APP_UPDATE' ? rawType : undefined;
      const items = await listActiveAnnouncements(db, announcementType);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/announcements', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `annpub:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const created = await publishAnnouncementAdminTx(db, actor, {
        announcementType: req.body?.announcementType,
        title: String(req.body?.title || ''),
        body: String(req.body?.body || ''),
        priority: req.body?.priority,
        targetVersion: req.body?.targetVersion ?? null,
        apkDownloadUrl: req.body?.apkDownloadUrl ?? null,
        forceUpdate: Boolean(req.body?.forceUpdate),
      });

      realtimeHub.emitEvent('announcements:updated', 'public:announcements', { id: created.id });
      res.status(201).json({ ok: true, announcement: created });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/admin/announcements/:id', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `anndel:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteAnnouncementAdminTx(db, actor, String(req.params.id || ''));
      realtimeHub.emitEvent('announcements:updated', 'public:announcements', { id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/reports', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reportpost:${ipHash}`, 8, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const report = await createScamReportTx(db, actor, {
        accusedUid: req.body?.accusedUid ?? null,
        accusedName: req.body?.accusedName ?? null,
        accusedPhone: req.body?.accusedPhone ?? null,
        category: req.body?.category,
        description: String(req.body?.description || ''),
      });
      realtimeHub.emitEvent('reports:new', 'admin:ops', { reportId: report.id });
      res.status(201).json({ ok: true, report });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/admin/reports', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reportget:${ipHash}`, 30, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listScamReportsAdmin(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/reports/:reportId/resolve', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reportres:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const rawStatus = String(req.body?.status || 'ACTION_TAKEN').toUpperCase();
      const status: 'UNDER_REVIEW' | 'ACTION_TAKEN' | 'DISMISSED' =
        rawStatus === 'UNDER_REVIEW' || rawStatus === 'DISMISSED' ? rawStatus : 'ACTION_TAKEN';

      const updated = await resolveScamReportAdminTx(
        db,
        actor,
        String(req.params.reportId || ''),
        status,
        req.body?.resolutionNote ? String(req.body.resolutionNote) : undefined
      );
      realtimeHub.emitEvent('reports:updated', 'admin:ops', { reportId: updated.id });
      res.json({ ok: true, report: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/admin/reports/:reportId', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reportdel:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteScamReportAdminTx(db, actor, String(req.params.reportId || ''));
      realtimeHub.emitEvent('reports:updated', 'admin:ops', { reportId: req.params.reportId });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/gratitude', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `gratget:${ipHash}`, 60, 60_000))) return;

    try {
      const items = await listGratitudeNotes(db, req.query.limit ? Number(req.query.limit) : 30);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/gratitude', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `gratpost:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const created = await postGratitudeNoteTx(db, actor, {
        honoredDonorUid: req.body?.honoredDonorUid ?? null,
        honoredDonorName: req.body?.honoredDonorName ?? null,
        bloodGroup: req.body?.bloodGroup ?? null,
        district: req.body?.district ?? null,
        message: String(req.body?.message || ''),
      });
      realtimeHub.emitEvent('gratitude:new', 'public:gratitude', { id: created.id });
      res.status(201).json({ ok: true, note: created });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ==========================================================================
  // 8. ADMIN GOVERNANCE, CO-ADMIN INVITES, AUDIT LOGS & MAINTENANCE JOBS
  // ==========================================================================
  const handleAdminInventoryWrite = async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininv:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updated = await updateBloodInventoryTx(db, actor, {
        bloodBankCode: String(req.body?.bloodBankCode || req.body?.bloodBankId || 'BD-CENTRAL-RESERVE'),
        bloodBankName: String(req.body?.bloodBankName || 'BloodSearch Central Transfusion Reserve'),
        district: String(req.body?.district || 'Dhaka'),
        address: String(req.body?.address || 'Bangladesh'),
        contactPhone: String(req.body?.contactPhone || '16263'),
        bloodGroup: String(req.body?.bloodGroup || ''),
        componentType: req.body?.componentType,
        unitsAvailable: Number(req.body?.unitsAvailable ?? 0),
        criticalThreshold:
          req.body?.criticalThreshold !== undefined ? Number(req.body.criticalThreshold) : undefined,
      });

      realtimeHub.emitEvent('stock:updated', 'public:stock', {
        bloodGroup: updated.inventory.bloodGroup,
      });
      res.json({ ok: true, bank: updated.bank, inventory: updated.inventory });
    } catch (err) {
      handleRouteError(res, err);
    }
  };

  router.put('/admin/inventory', handleAdminInventoryWrite);
  router.post('/admin/blood-inventory', handleAdminInventoryWrite);

  router.get('/admin/admins', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `adminlist:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listAdminsAdmin(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/roles', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `adminroles:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const updated = await manageAdminRoleTx(db, actor, {
        targetUid: String(req.body?.targetUid || ''),
        targetEmail: String(req.body?.targetEmail || ''),
        role: (req.body?.role || 'CO_ADMIN') as 'CO_ADMIN' | 'MODERATOR',
        isActive: req.body?.isActive !== false,
        permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : undefined,
      });

      res.json({ ok: true, adminRole: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/admin/users', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `adminusers:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listUsersAdmin(db, actor, req.query.limit ? Number(req.query.limit) : 100);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/users/:uid/status', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `adminustatus:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const nextStatus = req.body?.accountStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      const updated = await updateUserAccountStatusAdminTx(
        db,
        actor,
        String(req.params.uid || ''),
        nextStatus
      );
      res.json({ ok: true, user: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/admin/users/:uid', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admuserdel:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const targetUid = String(req.params.uid || '');
      const deleted = await adminDeleteUserTx(db, actor, targetUid);
      if (deleted) {
        realtimeHub.emitEvent('donors:deleted', 'public:donors', { donorId: targetUid });
      }
      res.json({ ok: true, deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/admin/invites', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvlist:${ipHash}`, 25, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;
      const items = await listOwnerInviteLocksTx(db, actor);
      res.json({ ok: true, items });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/invites', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvcreate:${ipHash}`, 8, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      if (req.body?.rawCode) {
        const lock = await createCustomOwnerInviteLockTx(
          db,
          actor,
          String(req.body.rawCode),
          String(req.body?.label || 'Admin Invite Code')
        );
        res.status(201).json({ ok: true, ...lock });
        return;
      }

      const invite = await createCoAdminInviteCodeTx(db, actor, String(req.body?.targetEmail || ''));
      res.status(201).json({ ok: true, ...invite });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.patch('/admin/invites/:proofHash', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvtoggle:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await toggleOwnerInviteLockTx(
        db,
        actor,
        String(req.params.proofHash || ''),
        Boolean(req.body?.active),
        req.body?.label ? String(req.body.label) : undefined
      );
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.delete('/admin/invites/:proofHash', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvdel:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await deleteOwnerInviteLockTx(db, actor, String(req.params.proofHash || ''));
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/invites/verify', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvver:${ipHash}`, 10, 5 * 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      if (actor.role === 'SUPER_ADMIN') {
        res.json({ ok: true, valid: true, proofHash: `SUPER_OWNER_${actor.uid.slice(0, 12)}` });
        return;
      }

      const checked = await verifyOrClaimOwnerVaultInviteCodeTx(
        db,
        actor,
        String(req.body?.inviteCode || ''),
        false
      );
      res.json({ ok: true, ...checked });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/invites/claim', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `admininvclaim:${ipHash}`, 8, 5 * 60_000))) return;

    try {
      const verified = await verifyRequestSession(req, db, {
        verifyActorOverride: options?.verifyActorOverride,
        enforceCsrfOnCookieMutation: true,
      });
      if (!verified) {
        res.status(401).json({ ok: false, code: 'UNAUTHENTICATED', message: 'Sign in first.' });
        return;
      }

      const codeStr = String(req.body?.inviteCode || '');
      let granted: unknown = null;

      // Support both Email-Bound BSADM codes and Super Owner Vault codes
      try {
        granted = await claimCoAdminInviteCodeTx(db, verified.actor, codeStr);
      } catch (err) {
        const vaultResult = await verifyOrClaimOwnerVaultInviteCodeTx(
          db,
          verified.actor,
          codeStr,
          true
        );
        if (!vaultResult.valid) {
          throw err;
        }
        granted = vaultResult;
      }

      // Immediately rotate session after privilege elevation!
      let rotated: { csrfToken?: string; sessionToken?: string } = {};
      if (verified.authTransport !== 'TEST_OVERRIDE') {
        const freshSession = await createOpaqueSessionTx(db, {
          userUid: verified.actor.uid,
          authMethod: 'GOOGLE_OIDC',
          ipHash,
          userAgent: String(req.headers['user-agent'] || ''),
          rotateExistingSessions: true,
          rotatedFromSessionId: verified.sessionId || undefined,
        });
        setOpaqueSessionCookie(req, res, freshSession.sessionToken, ADMIN_SESSION_TTL_MS);
        rotated = {
          csrfToken: freshSession.csrfToken,
          sessionToken: freshSession.sessionToken,
        };
      }

      res.json({ ok: true, adminRole: granted, ...rotated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/zero-slate-reset', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `zeroslate:${ipHash}`, 3, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      await zeroSlateOperationalResetAdminTx(db, actor);
      realtimeHub.emitEvent('requests:updated', 'public:requests', { reset: true });
      realtimeHub.emitEvent('community:updated', 'public:community', { reset: true });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/notifications/retry', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `notifretry:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      if (!isAdminRole(actor.role)) {
        throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
      }

      const result = await retryFailedNotificationsAndAlertsTx(db, actor);
      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/admin/requests/expire-stale', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `reqexp:${ipHash}`, 10, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;
      if (!isAdminRole(actor.role)) {
        throw new DomainSecurityError(403, 'ADMIN_REQUIRED', 'Admin role required.');
      }

      const expiredCount = await expireStaleBloodRequestsTx(db);
      res.json({ ok: true, expiredCount });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.get('/admin/audit-logs', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `auditlogs:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db, false);
      if (!actor) return;

      const logs = await queryAuditLogsPaginated(
        db,
        actor,
        req.query.page ? Number(req.query.page) : 1,
        req.query.limit ? Number(req.query.limit) : 25
      );
      res.json({ ok: true, ...logs });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/devices/token', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `devtok:${ipHash}`, 15, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const saved = await upsertDeviceTokenTx(db, actor, {
        pushToken: String(req.body?.pushToken || req.body?.deviceToken || ''),
        platform: String(req.body?.platform || 'WEB_PWA').toUpperCase() as
          | 'WEB_PWA'
          | 'ANDROID_APK'
          | 'IOS_WEB',
        deviceLabel: req.body?.deviceLabel ? String(req.body.deviceLabel) : undefined,
      });

      res.json({
        ok: true,
        device: { id: saved.id, platform: saved.platform, isActive: saved.isActive },
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  router.post('/auth/session', async (req: Request, res: Response) => {
    const db = await requireDatabase(res);
    if (!db) return;

    const ipHash = extractHashedClientIp(req);
    if (!(await enforceDistributedRateLimit(res, db, `authsess:${ipHash}`, 20, 60_000))) return;

    try {
      const actor = await requireAuthenticatedActor(req, res, db);
      if (!actor) return;

      const authHeader = String(req.headers.authorization || '').slice(7, 47);
      const session = await recordLoginSessionTx(db, actor, {
        rawTokenFragment: authHeader || actor.uid,
        authMethod: (req.body?.authMethod || 'GOOGLE_OIDC') as
          | 'GOOGLE_OIDC'
          | 'GOOGLE_OAUTH'
          | 'EMAIL_PASSWORD'
          | 'PHONE_OTP'
          | 'ADMIN_CONSOLE',
        userAgent: String(req.headers['user-agent'] || ''),
        isAdminConsole: Boolean(req.body?.isAdminConsole),
      });

      res.json({
        ok: true,
        session: {
          id: session.id,
          uid: actor.uid,
          role: actor.role,
          isAdminConsole: session.isAdminConsole,
          expiresAt: session.expiresAt,
        },
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  return router;
}
