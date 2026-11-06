import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import { ensureMainPostgresReady } from './src/db/index';
import {
  DomainSecurityError,
  isAdminRole,
  type AuthenticatedActor,
} from './src/db/repositories/bloodSearchRepo';
import {
  ADMIN_SESSION_TTL_MS,
  authenticateGoogleClaimsInNeonTx,
  authenticateVerifiedPhoneInNeonTx,
  consumeGoogleOidcNonceTx,
  extractHashedClientIp,
  SESSION_TTL_MS,
  setOpaqueSessionCookie,
  verifyGoogleOidcIdToken,
  verifyRawSessionFromHeaders,
  verifyRequestSession,
} from './src/server/authAndSessionService';
import {
  createNeonApiRouter,
  resolveAppCallbackRedirectUri,
  resolveGoogleOauthClientId,
  resolveGoogleOauthClientSecret,
} from './src/server/neonRoutes';
import { BloodSearchOtpService, type OtpServiceOptions } from './src/server/otpService';
import { realtimeHub } from './src/server/realtimeHub';

dotenv.config();

const __dirname = process.cwd();

export interface VerifiedCaller {
  uid: string;
  emailVerified: boolean;
  rawEmailVerified?: boolean;
  emailHash: string;
}

export interface SanitizedAuditEvent {
  id: string;
  action:
    | 'SOS_DISPATCH_VALIDATED'
    | 'SOS_ESCALATION_TRIGGERED'
    | 'SOS_ALERT_STOPPED'
    | 'RATE_LIMIT_BLOCKED'
    | 'DUPLICATE_SOS_BLOCKED'
    | 'SMS_DISPATCH_ATTEMPT'
    | 'OTP_CHALLENGE_ISSUED'
    | 'OTP_CHALLENGE_VERIFIED'
    | 'OTP_CHALLENGE_BLOCKED';
  actorUidHash: string;
  requestId: string;
  bloodGroup?: string;
  district?: string;
  escalationLevel?: number;
  channelSummary: string;
  timestampIso: string;
}

interface ActiveServerRequestState {
  requestId: string;
  ownerUid: string;
  bloodGroup: string;
  district: string;
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
  escalationLevel: number;
  notifiedDonorHashes: Set<string>;
  createdAtMs: number;
  lastEscalatedAtMs: number;
}

const VALID_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const VALID_URGENCIES = new Set(['CRITICAL', 'URGENT', 'STANDARD']);

const ESCALATION_TIERS = [
  { level: 0, radiusKm: 5, includeNearbyDistricts: false, labelEn: '5 km Local Radius', labelBn: '৫ কিমি স্থানীয় পরিধি' },
  { level: 1, radiusKm: 15, includeNearbyDistricts: false, labelEn: '15 km City Radius', labelBn: '১৫ কিমি শহর পরিধি' },
  { level: 2, radiusKm: 40, includeNearbyDistricts: true, labelEn: '40 km + Nearby Areas', labelBn: '৪০ কিমি ও পার্শ্ববর্তী এলাকা' },
  { level: 3, radiusKm: 85, includeNearbyDistricts: true, labelEn: 'Nearby Districts (85 km)', labelBn: 'পার্শ্ববর্তী জেলাসমূহ (৮৫ কিমি)' },
  { level: 4, radiusKm: 500, includeNearbyDistricts: true, labelEn: 'All Bangladesh Emergency', labelBn: 'সারাদেশ জরুরি নেটওয়ার্ক' },
];

export function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function isSafeHttpsWebhookUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === '[::1]'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getNotificationCapabilities() {
  const webPushPublicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const smsProviderRaw = (process.env.SMS_PROVIDER || 'NONE').trim().toUpperCase();

  const twilioReady =
    smsProviderRaw === 'TWILIO' &&
    Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
    Boolean(process.env.TWILIO_FROM_NUMBER?.trim());

  const webhookReady =
    smsProviderRaw === 'WEBHOOK_BD' &&
    isSafeHttpsWebhookUrl(process.env.SMS_WEBHOOK_URL) &&
    Boolean(process.env.SMS_WEBHOOK_API_KEY?.trim());

  const smsConfigured = twilioReady || webhookReady;

  return {
    webPushConfigured: webPushPublicKey.length > 20,
    smsConfigured,
    smsProvider: smsConfigured ? smsProviderRaw : 'NONE',
    inAppRealtimeAlerts: true,
    browserLocalNotificationSupported: true,
    rateLimits: {
      maxBroadcastsPer10Min: 4,
      maxEscalationsPer15Min: 6,
      duplicateWindowMinutes: 10,
    },
  };
}

function buildConfiguredAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const addSafeOrigin = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw.trim());
      allowed.add(u.origin.toLowerCase());
    } catch {}
  };

  addSafeOrigin(process.env.APP_URL);
  addSafeOrigin(process.env.SHARED_APP_URL);
  for (const part of String(process.env.CORS_ALLOWED_ORIGINS || '').split(',')) {
    addSafeOrigin(part);
  }

  // Capacitor Android & iOS hybrid WebView origins
  if (process.env.CAPACITOR_ALLOW_NATIVE_ORIGIN !== 'false') {
    allowed.add('capacitor://localhost');
    allowed.add('https://localhost');
    if (process.env.NODE_ENV !== 'production') {
      allowed.add('http://localhost');
      allowed.add('http://localhost:3000');
      allowed.add('http://127.0.0.1:3000');
    }
  }
  return allowed;
}

function evaluateRequestOrigin(
  originHeader: string,
  req: Request,
  configuredAllowlist: Set<string>
): { allowed: boolean; normalizedOrigin: string | null } {
  const raw = originHeader.trim();
  if (!raw) return { allowed: true, normalizedOrigin: null };
  if (raw.toLowerCase() === 'null') return { allowed: false, normalizedOrigin: null };

  // Special handling for capacitor://localhost
  if (raw.toLowerCase() === 'capacitor://localhost') {
    return {
      allowed: configuredAllowlist.has('capacitor://localhost'),
      normalizedOrigin: 'capacitor://localhost',
    };
  }

  try {
    const parsed = new URL(raw);
    const normalizedOrigin = parsed.origin;
    const lowerOrigin = normalizedOrigin.toLowerCase();
    const hostHeader = String(req.headers.host || '')
      .split(',')[0]
      ?.trim()
      .toLowerCase();

    if (hostHeader && parsed.host.toLowerCase() === hostHeader) {
      return { allowed: true, normalizedOrigin };
    }
    if (configuredAllowlist.has(lowerOrigin)) {
      return { allowed: true, normalizedOrigin };
    }
    return { allowed: false, normalizedOrigin: null };
  } catch {
    return { allowed: false, normalizedOrigin: null };
  }
}

export function createEmergencyApiApp(options?: {
  verifyTokenOverride?: (token: string) => Promise<VerifiedCaller | null>;
  verifyNeonActorOverride?: (token: string) => Promise<AuthenticatedActor | null>;
  otpServiceOptions?: OtpServiceOptions;
}) {
  const app = express();
  app.disable('x-powered-by');

  const isProd =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  const auditIpSalt = String(process.env.AUDIT_IP_SALT || '').trim();
  if (
    isProd &&
    (auditIpSalt.length < 32 || /^(YOUR_|GENERATE_|REPLACE_|CHANGE_ME)/i.test(auditIpSalt))
  ) {
    throw new Error('AUDIT_IP_SALT must be configured with a unique random secret of at least 32 characters in production.');
  }
  const configuredAllowlist = buildConfiguredAllowedOrigins();
  const otpService = new BloodSearchOtpService(options?.otpServiceOptions);

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://www.gstatic.com https://www.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' ws: wss: https://*.googleapis.com https://www.gstatic.com https://accounts.google.com https://nominatim.openstreetmap.org https://router.project-osrm.org https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com",
    "frame-src 'self' https://accounts.google.com https://www.google.com",
    "frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com https://*.run.app",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
  const BLOCKED_SCANNER_UAS =
    /\b(sqlmap|nikto|acunetix|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|feroxbuster|ffuf|wfuzz|wpscan|havij|commix|scrapy|nessus|openvas|hydra|medusa|burpsuite|metasploit|dalfox|xsstrike|arachni)\b/i;
  const BIDI_OR_NULL_RE = /[\u0000\u202A-\u202E\u2066-\u2069]/;

  const hasMaliciousObjectKeysOrNullBytes = (val: unknown, depth = 0): boolean => {
    if (depth > 8) return true;
    if (typeof val === 'string') {
      return BIDI_OR_NULL_RE.test(val);
    }
    if (Array.isArray(val)) {
      return val.some((item) => hasMaliciousObjectKeysOrNullBytes(item, depth + 1));
    }
    if (val && typeof val === 'object') {
      const rawObj = val as Record<string, unknown>;
      for (const key of Object.keys(rawObj)) {
        if (
          key === '__proto__' ||
          key === 'constructor' ||
          key === 'prototype' ||
          key.startsWith('$') ||
          BIDI_OR_NULL_RE.test(key)
        ) {
          return true;
        }
        if (hasMaliciousObjectKeysOrNullBytes(rawObj[key], depth + 1)) {
          return true;
        }
      }
    }
    return false;
  };

  app.use((req, res, next) => {
    const lowerPath = (req.path || '').toLowerCase();
    const isOAuthCallback = lowerPath === '/auth/callback' || lowerPath === '/auth/callback/';

    res.setHeader(
      'Cross-Origin-Opener-Policy',
      isOAuthCallback ? 'unsafe-none' : 'same-origin-allow-popups'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), usb=(), payment=(), serial=(), bluetooth=(), midi=(), geolocation=(self), microphone=(self)'
    );
    res.setHeader('Content-Security-Policy', cspDirectives);
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }

    if (!ALLOWED_METHODS.has(String(req.method || '').toUpperCase())) {
      res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    const checkUrlLen = String(req.originalUrl || req.url || '');
    if (checkUrlLen.length > 2048) {
      res.status(414).json({ ok: false, code: 'URI_TOO_LONG' });
      return;
    }

    const ua = String(req.headers['user-agent'] || '');
    if (ua && BLOCKED_SCANNER_UAS.test(ua)) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN_SCANNER' });
      return;
    }

    const isWellKnownAssetLinks = lowerPath === '/.well-known/assetlinks.json';
    const isPublicDownloads = lowerPath.startsWith('/downloads/');
    const isBlockedSensitiveFile =
      !isWellKnownAssetLinks &&
      !isPublicDownloads &&
      (lowerPath.includes('..') ||
        lowerPath.includes('%2e%2e') ||
        lowerPath.includes('\0') ||
        lowerPath.startsWith('/.env') ||
        lowerPath.startsWith('/.git') ||
        lowerPath.startsWith('/.data') ||
        lowerPath.startsWith('/drizzle') ||
        lowerPath.startsWith('/backups') ||
        lowerPath.startsWith('/scripts') ||
        lowerPath.startsWith('/tests') ||
        lowerPath.startsWith('/android') ||
        lowerPath.startsWith('/src/db') ||
        lowerPath.startsWith('/src/server') ||
        lowerPath.endsWith('.sql') ||
        lowerPath.endsWith('.map') ||
        lowerPath.endsWith('.md') ||
        lowerPath === '/drizzle.config.ts' ||
        lowerPath === '/capacitor.config.ts' ||
        lowerPath === '/vite.config.ts' ||
        lowerPath === '/tsconfig.json' ||
        lowerPath === '/server.ts' ||
        lowerPath === '/package.json' ||
        lowerPath === '/package-lock.json');

    if (isBlockedSensitiveFile) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN_RESOURCE' });
      return;
    }

    // Strict CORS Allowlist & Cross-Site Origin Validation
    const originHeader = String(req.headers.origin || '').trim();
    if (originHeader) {
      const originCheck = evaluateRequestOrigin(originHeader, req, configuredAllowlist);
      if (!originCheck.allowed) {
        if (lowerPath.startsWith('/api/') || req.method === 'OPTIONS') {
          res.status(403).json({
            ok: false,
            code: 'CORS_ORIGIN_DENIED',
            message: 'Origin is not permitted by the server CORS allowlist.',
          });
          return;
        }
      } else if (originCheck.normalizedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', originCheck.normalizedOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-CSRF-Token'
        );
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'
        );
        if (req.method === 'OPTIONS') {
          res.status(204).end();
          return;
        }
      }
    } else if (
      lowerPath.startsWith('/api/') &&
      (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')
    ) {
      const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
      if (secFetchSite === 'cross-site') {
        res.status(403).json({ ok: false, code: 'CSRF_CROSS_SITE_BLOCKED' });
        return;
      }
    }

    next();
  });

  // =========================================================================
  // GOOGLE OIDC POPUP CALLBACK (/auth/callback & /auth/callback/)
  // Verifies code -> Google ID token -> RS256 JWKS + iss + aud + exp + email_verified
  // + atomic single-use nonce & state in Neon, sets HttpOnly session cookie,
  // and posts completion message to opener iframe window.
  // =========================================================================
  const handleGoogleOAuthCallback = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    let callbackTargetOrigin = '';
    let callbackRedirectUri = '';

    const renderPopupResult = (payload: Record<string, unknown>, statusMessage: string) => {
      const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
      const safeMsg = statusMessage.replace(/[<>&"]/g, '');
      const safeTargetOrigin = JSON.stringify(callbackTargetOrigin);
      res.send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>BloodSearch Sign-In</title></head>
<body style="font-family:system-ui,sans-serif;background:#090d16;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;padding:24px">
    <p style="font-size:15px">${safeMsg}</p>
  </div>
  <script>
    (function() {
      var msg = ${safeJson};
      if (window.opener) {
        if (${safeTargetOrigin}) {
          window.opener.postMessage(msg, ${safeTargetOrigin});
        }
        window.close();
      } else {
        window.location.href = '/';
      }
    })();
  </script>
</body>
</html>`);
    };

    try {
      callbackRedirectUri = resolveAppCallbackRedirectUri(req);
      callbackTargetOrigin = new URL(callbackRedirectUri).origin;

      const oauthError = String(req.query.error || '').trim();
      if (oauthError) {
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'GOOGLE_DENIED', message: 'Google sign-in was cancelled.' },
          'Sign-in cancelled. Closing window...'
        );
        return;
      }

      const code = String(req.query.code || '').trim();
      const state = String(req.query.state || '').trim();
      if (!code || !state) {
        res.status(400);
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'MISSING_CODE_OR_STATE', message: 'Missing authorization code or state.' },
          'Invalid callback parameters.'
        );
        return;
      }

      const { db } = await ensureMainPostgresReady();
      if (!db) {
        res.status(503);
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'DB_UNAVAILABLE', message: 'Primary database unavailable.' },
          'Database temporarily unavailable.'
        );
        return;
      }

      // Synthetic identities are permitted only in explicitly opted-in non-production.
      const mockEmail = String(req.query.mockEmail || '').trim().toLowerCase();
      if (mockEmail) {
        const isProductionDeployment =
          process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
        if (isProductionDeployment || process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX !== 'true') {
          res.status(404);
          renderPopupResult(
            { type: 'OAUTH_AUTH_ERROR', code: 'NOT_FOUND', message: 'Not found.' },
            'Authentication route not found.'
          );
          return;
        }
        const mockNonce = String(req.query.mockNonce || '').trim();
        const mockName = String(req.query.mockName || mockEmail.split('@')[0] || 'User').trim();
        if (mockNonce) {
          await consumeGoogleOidcNonceTx(db, mockNonce, state).catch(() => {});
        }

        const ipHash = extractHashedClientIp(req);
        const claims = {
          sub: `sandbox_${crypto.createHash('sha256').update(mockEmail).digest('hex').slice(0, 16)}`,
          email: mockEmail,
          emailVerified: true,
          name: mockName,
          picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(mockEmail)}`,
          nonce: mockNonce,
        };

        const session = await authenticateGoogleClaimsInNeonTx(
          db,
          claims,
          ipHash,
          String(req.headers['user-agent'] || '')
        );

        const ttlMs = isAdminRole(session.actor.role) ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
        setOpaqueSessionCookie(req, res, session.sessionToken, ttlMs);

        renderPopupResult(
          {
            type: 'OAUTH_AUTH_SUCCESS',
            csrfToken: session.csrfToken,
            sessionToken: session.sessionToken,
          },
          'Authentication successful. Closing window...'
        );
        return;
      }

      const clientId = resolveGoogleOauthClientId();
      const clientSecret = resolveGoogleOauthClientSecret();
      if (!clientId || !clientSecret) {
        res.status(503);
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'GOOGLE_OAUTH_NOT_CONFIGURED', message: 'Google OAuth is not configured on the server.' },
          'Server OAuth configuration missing.'
        );
        return;
      }

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackRedirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenResp.ok) {
        res.status(401);
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange Google authorization code.' },
          'Authentication failed. Please retry.'
        );
        return;
      }

      const tokenJson = (await tokenResp.json()) as { id_token?: string };
      if (!tokenJson.id_token) {
        res.status(401);
        renderPopupResult(
          { type: 'OAUTH_AUTH_ERROR', code: 'ID_TOKEN_MISSING', message: 'Google did not return an OIDC ID token.' },
          'Authentication failed.'
        );
        return;
      }

      const claims = await verifyGoogleOidcIdToken({
        idToken: tokenJson.id_token,
        expectedClientId: clientId,
      });

      if (!claims.nonce) {
        throw new DomainSecurityError(401, 'OIDC_NONCE_MISSING', 'Missing OIDC nonce in Google ID token.');
      }

      await consumeGoogleOidcNonceTx(db, claims.nonce, state);

      const ipHash = extractHashedClientIp(req);
      const session = await authenticateGoogleClaimsInNeonTx(
        db,
        claims,
        ipHash,
        String(req.headers['user-agent'] || '')
      );

      const ttlMs = isAdminRole(session.actor.role) ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
      setOpaqueSessionCookie(req, res, session.sessionToken, ttlMs);

      renderPopupResult(
        {
          type: 'OAUTH_AUTH_SUCCESS',
          csrfToken: session.csrfToken,
          sessionToken: session.sessionToken,
        },
        'Authentication successful. Closing window...'
      );
    } catch (err) {
      const msg =
        err instanceof DomainSecurityError
          ? err.message
          : 'Google OIDC verification failed.';
      res.status(401);
      renderPopupResult(
        { type: 'OAUTH_AUTH_ERROR', code: 'OIDC_VERIFICATION_FAILED', message: msg },
        msg
      );
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], handleGoogleOAuthCallback);

  // Explicitly opt-in local development sandbox; never expose it in production.
  app.get(['/auth/google-sandbox', '/auth/google-sandbox/'], (req: Request, res: Response) => {
    const isProductionDeployment =
      process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    if (isProductionDeployment || process.env.BLOODSEARCH_ENABLE_AUTH_SANDBOX !== 'true') {
      res.status(404).setHeader('Cache-Control', 'no-store');
      res.end('Not found');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const redirectUri = String(req.query.redirect_uri || '/auth/callback');
    const state = String(req.query.state || '');
    const nonce = String(req.query.nonce || '');

    const safeRedirect = redirectUri.replace(/[<>"']/g, '');
    const safeState = state.replace(/[<>"']/g, '');
    const safeNonce = nonce.replace(/[<>"']/g, '');

    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with Google - BloodSearch</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .header { text-align: center; margin-bottom: 24px; }
    .google-logo { width: 44px; height: 44px; margin: 0 auto 12px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #94a3b8; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-admin { background: #fef3c7; color: #b45309; }
    .badge-donor { background: #dcfce7; color: #15803d; }
    .account-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 14px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #f8fafc;
      text-align: left;
      cursor: pointer;
      margin-bottom: 12px;
      transition: all 0.15s ease;
    }
    .account-btn:hover {
      background: #1e293b;
      border-color: #e11d48;
      transform: translateY(-1px);
    }
    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #e11d48;
      color: white;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .avatar.admin { background: #f59e0b; color: #000; }
    .account-info { flex: 1; min-width: 0; }
    .account-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .account-email { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .divider { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: #64748b; font-size: 11px; font-weight: 700; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: #334155; }
    .custom-form { display: flex; gap: 8px; }
    .custom-input {
      flex: 1;
      height: 42px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #fff;
      font-size: 13px;
    }
    .custom-input:focus { outline: none; border-color: #e11d48; }
    .submit-btn {
      height: 42px;
      padding: 0 16px;
      border-radius: 10px;
      border: none;
      background: #e11d48;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .footer-note {
      text-align: center;
      margin-top: 18px;
      font-size: 11px;
      color: #64748b;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <svg class="google-logo" viewBox="0 0 24 24">
        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"/>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
        <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"/>
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"/>
      </svg>
      <h1>Sign in with Google</h1>
      <p class="subtitle">Choose an account to continue to <strong>BloodSearch</strong></p>
    </div>

    <button type="button" class="account-btn" onclick="selectAccount('shamimrakib015@gmail.com', 'Shamim Rakib')">
      <div class="avatar admin">SR</div>
      <div class="account-info">
        <div class="account-name">Shamim Rakib <span class="badge badge-admin">Super Admin</span></div>
        <div class="account-email">shamimrakib015@gmail.com</div>
      </div>
    </button>

    <button type="button" class="account-btn" onclick="selectAccount('donor.volunteer@bloodsearch.bd', 'Volunteer Donor')">
      <div class="avatar">BD</div>
      <div class="account-info">
        <div class="account-name">Volunteer Blood Donor <span class="badge badge-donor">Donor</span></div>
        <div class="account-email">donor.volunteer@bloodsearch.bd</div>
      </div>
    </button>

    <div class="divider">OR USE ANY GMAIL ACCOUNT</div>

    <form class="custom-form" onsubmit="handleCustomSubmit(event)">
      <input type="email" id="customEmail" class="custom-input" placeholder="another.user@gmail.com" required>
      <button type="submit" class="submit-btn">Continue</button>
    </form>

    <p class="footer-note">
      BloodSearch Neon PostgreSQL Auth · 256-bit OIDC Nonce Protection
    </p>
  </div>

  <script>
    function selectAccount(email, name) {
      var dest = ${JSON.stringify(safeRedirect)};
      var s = ${JSON.stringify(safeState)};
      var n = ${JSON.stringify(safeNonce)};
      var u = dest + '?code=sandbox_' + Date.now() + '&state=' + encodeURIComponent(s) + '&mockEmail=' + encodeURIComponent(email) + '&mockName=' + encodeURIComponent(name) + '&mockNonce=' + encodeURIComponent(n);
      window.location.href = u;
    }
    function handleCustomSubmit(e) {
      e.preventDefault();
      var input = document.getElementById('customEmail');
      var val = input ? input.value.trim() : '';
      if (val && val.includes('@')) {
        selectAccount(val, val.split('@')[0]);
      }
    }
  </script>
</body>
</html>`);
  });

  // Dynamic Cryptographic Android APK / TWA Digital Asset Links Endpoint
  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const pkgName = (process.env.ANDROID_APK_PACKAGE_NAME || 'bd.bloodsearch.app').trim();
    const rawCerts = (process.env.ANDROID_APK_SHA256_FINGERPRINT || '').trim();
    const validCerts = rawCerts
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s) && !/^00(:00){31}$/.test(s));

    if (validCerts.length === 0 || !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(pkgName)) {
      res.json([]);
      return;
    }

    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkgName,
          sha256_cert_fingerprints: validCerts,
        },
      },
    ]);
  });

  app.use(express.json({ limit: '512kb', strict: true }));

  app.use((err: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    if (err && typeof err === 'object' && ('type' in err || err instanceof SyntaxError)) {
      res.status(400).json({
        ok: false,
        code: 'MALFORMED_JSON_PAYLOAD',
        message: 'Invalid or oversized JSON request body.',
      });
      return;
    }
    next(err);
  });

  app.use('/api', (req: Request, res: Response, next) => {
    if (!req.headers.origin) {
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    const hasQueryArrayPollution =
      req.query &&
      typeof req.query === 'object' &&
      Object.values(req.query).some((v) => Array.isArray(v));
    if (
      hasQueryArrayPollution ||
      hasMaliciousObjectKeysOrNullBytes(req.body) ||
      hasMaliciousObjectKeysOrNullBytes(req.query)
    ) {
      res.status(400).json({
        ok: false,
        code: 'MALICIOUS_PAYLOAD_BLOCKED',
        message: 'Malformed or disallowed request payload keys.',
      });
      return;
    }
    next();
  });

  // Mount dedicated Neon PostgreSQL primary database API (/api/v1/*)
  app.use(
    '/api/v1',
    createNeonApiRouter({
      verifyActorOverride: options?.verifyNeonActorOverride,
      otpService,
    })
  );

  const MAX_SERVER_BUCKETS = 5000;
  const rateBuckets = new Map<string, number[]>();
  const duplicateFingerprints = new Map<string, { requestId: string; timestampMs: number }>();
  const activeRequests = new Map<string, ActiveServerRequestState>();
  const auditTrail: SanitizedAuditEvent[] = [];

  const pruneBoundedMap = <K, V>(map: Map<K, V>, maxEntries = MAX_SERVER_BUCKETS) => {
    while (map.size >= maxEntries) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  };

  const recordAudit = (entry: Omit<SanitizedAuditEvent, 'id' | 'timestampIso'>) => {
    auditTrail.unshift({
      ...entry,
      id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      timestampIso: new Date().toISOString(),
    });
    if (auditTrail.length > 200) {
      auditTrail.length = 200;
    }
  };

  const checkRateLimit = (bucketKey: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSec: number } => {
    const now = Date.now();
    const prev = rateBuckets.get(bucketKey) || [];
    const active = prev.filter((ts) => now - ts < windowMs);
    if (active.length >= maxRequests) {
      const oldest = active[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      rateBuckets.set(bucketKey, active);
      return { allowed: false, retryAfterSec };
    }
    if (!rateBuckets.has(bucketKey)) {
      pruneBoundedMap(rateBuckets);
    }
    active.push(now);
    rateBuckets.set(bucketKey, active);
    return { allowed: true, retryAfterSec: 0 };
  };

  const verifyCallerSession = async (req: Request): Promise<VerifiedCaller | null> => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (bearerToken && options?.verifyTokenOverride) {
      return options.verifyTokenOverride(bearerToken);
    }

    const { db } = await ensureMainPostgresReady();
    if (!db) return null;

    try {
      const verified = await verifyRequestSession(req, db, {
        verifyActorOverride: options?.verifyNeonActorOverride,
        enforceCsrfOnCookieMutation: true,
      });
      if (!verified) return null;
      return {
        uid: verified.actor.uid,
        emailVerified: verified.actor.emailVerified,
        rawEmailVerified: verified.actor.emailVerified,
        emailHash: verified.actor.email
          ? sha256Short(verified.actor.email.toLowerCase())
          : 'phone-user',
      };
    } catch {
      return null;
    }
  };

  async function dispatchLegitimateSmsIfConfigured(
    phones: string[],
    messageText: string
  ): Promise<{ status: 'SENT' | 'NOT_CONFIGURED' | 'PROVIDER_ERROR'; sentCount: number; fallbackMessage: string }> {
    const caps = getNotificationCapabilities();
    if (!caps.smsConfigured || phones.length === 0) {
      return {
        status: 'NOT_CONFIGURED',
        sentCount: 0,
        fallbackMessage:
          'SMS gateway credentials are not configured on the server (SMS_PROVIDER=NONE). Using real-time WebSocket/SSE in-app alerts + direct Call/WhatsApp.',
      };
    }

    const cleanPhones = phones
      .map((p) => String(p || '').replace(/[^\d+]/g, ''))
      .filter((p) => /^(\+?8801[3-9]\d{8}|01[3-9]\d{8})$/.test(p))
      .slice(0, 15);

    if (cleanPhones.length === 0) {
      return {
        status: 'NOT_CONFIGURED',
        sentCount: 0,
        fallbackMessage: 'No valid opted-in Bangladesh (+8801...) SMS numbers provided in this batch.',
      };
    }

    try {
      if (caps.smsProvider === 'TWILIO') {
        const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
        const token = process.env.TWILIO_AUTH_TOKEN!.trim();
        const from = process.env.TWILIO_FROM_NUMBER!.trim();
        const authBasic = Buffer.from(`${sid}:${token}`).toString('base64');
        let sentCount = 0;

        await Promise.all(
          cleanPhones.map(async (toPhone) => {
            const normalizedTo = toPhone.startsWith('+')
              ? toPhone
              : toPhone.startsWith('880')
              ? `+${toPhone}`
              : `+88${toPhone}`;
            const form = new URLSearchParams({
              To: normalizedTo,
              From: from,
              Body: messageText.slice(0, 300),
            });
            const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
              method: 'POST',
              headers: {
                Authorization: `Basic ${authBasic}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: form.toString(),
            });
            if (r.ok) sentCount += 1;
          })
        );

        return {
          status: sentCount > 0 ? 'SENT' : 'PROVIDER_ERROR',
          sentCount,
          fallbackMessage:
            sentCount > 0
              ? `Dispatched ${sentCount} SMS message(s) via Twilio.`
              : 'Twilio rejected SMS dispatch; use direct Call or WhatsApp immediately.',
        };
      }

      if (caps.smsProvider === 'WEBHOOK_BD') {
        const url = process.env.SMS_WEBHOOK_URL!.trim();
        if (!isSafeHttpsWebhookUrl(url)) {
          return {
            status: 'PROVIDER_ERROR',
            sentCount: 0,
            fallbackMessage: 'SMS webhook URL must be an external HTTPS endpoint.',
          };
        }
        const apiKey = process.env.SMS_WEBHOOK_API_KEY!.trim();
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            recipients: cleanPhones,
            message: messageText.slice(0, 300),
          }),
        });
        if (r.ok) {
          return {
            status: 'SENT',
            sentCount: cleanPhones.length,
            fallbackMessage: `Dispatched ${cleanPhones.length} SMS message(s) via configured SMS gateway.`,
          };
        }
      }

      return {
        status: 'PROVIDER_ERROR',
        sentCount: 0,
        fallbackMessage: 'SMS gateway returned an error. Use direct Call, WhatsApp, or in-app alerts.',
      };
    } catch {
      return {
        status: 'PROVIDER_ERROR',
        sentCount: 0,
        fallbackMessage: 'SMS network request failed. Use direct Call, WhatsApp, or in-app alerts.',
      };
    }
  }

  app.get('/api/capabilities', (req: Request, res: Response) => {
    const ipKey = req.ip || 'unknown-ip';
    const capRate = checkRateLimit(`caps:ip:${ipKey}`, 60, 60 * 1000);
    if (!capRate.allowed) {
      res.status(429).json({ ok: false, code: 'RATE_LIMITED', retryAfterSec: capRate.retryAfterSec });
      return;
    }
    res.json({
      ok: true,
      capabilities: getNotificationCapabilities(),
    });
  });

  app.post('/api/emergency/dispatch', async (req: Request, res: Response) => {
    const caller = await verifyCallerSession(req);
    if (!caller || !caller.emailVerified) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Verified authenticated session is required to dispatch emergency broadcasts.',
      });
      return;
    }

    const body = req.body || {};
    const requestId = String(body.requestId || '').trim();
    const bloodGroup = String(body.bloodGroup || '').trim();
    const hospitalName = String(body.hospitalName || '').trim();
    const district = String(body.district || '').trim();
    const urgency = String(body.urgency || 'URGENT').trim();
    const candidateDonorIds: string[] = Array.isArray(body.candidateDonorIds)
      ? body.candidateDonorIds.map((id: unknown) => String(id || '').trim()).filter(Boolean).slice(0, 50)
      : [];
    const optedInSmsPhones: string[] = Array.isArray(body.optedInSmsPhones)
      ? body.optedInSmsPhones.map((p: unknown) => String(p || '').trim()).filter(Boolean).slice(0, 15)
      : [];
    const escalationIntervalMinutes = Math.min(60, Math.max(2, Number(body.escalationIntervalMinutes) || 10));

    if (
      !requestId ||
      requestId.length > 100 ||
      !/^[a-zA-Z0-9_-]+$/.test(requestId) ||
      !VALID_BLOOD_GROUPS.has(bloodGroup) ||
      hospitalName.length < 2 ||
      hospitalName.length > 200 ||
      district.length < 2 ||
      district.length > 80 ||
      !VALID_URGENCIES.has(urgency)
    ) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_PAYLOAD',
        message: 'Missing or invalid blood group, hospital name, district, or request ID.',
      });
      return;
    }

    const ipKey = req.ip || 'unknown-ip';
    const uidRate = checkRateLimit(`dispatch:uid:${caller.uid}`, 4, 10 * 60 * 1000);
    const ipRate = checkRateLimit(`dispatch:ip:${ipKey}`, 10, 10 * 60 * 1000);

    if (!uidRate.allowed || !ipRate.allowed) {
      const retryAfterSec = Math.max(uidRate.retryAfterSec, ipRate.retryAfterSec);
      recordAudit({
        action: 'RATE_LIMIT_BLOCKED',
        actorUidHash: sha256Short(caller.uid),
        requestId,
        bloodGroup,
        district,
        channelSummary: `Rate limit hit (${retryAfterSec}s cooldown)`,
      });
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterSec,
        message: `Broadcast rate limit reached to prevent donor spam. Please call available donors directly or retry in ${retryAfterSec}s.`,
      });
      return;
    }

    const dupHash = sha256Short(
      `${caller.uid}|${bloodGroup}|${hospitalName.toLowerCase().replace(/\s+/g, ' ')}|${district.toLowerCase()}`
    );
    const existingDup = duplicateFingerprints.get(dupHash);
    if (existingDup && Date.now() - existingDup.timestampMs < 10 * 60 * 1000 && existingDup.requestId !== requestId) {
      const prevReq = activeRequests.get(existingDup.requestId);
      if (!prevReq || prevReq.status === 'ACTIVE') {
        recordAudit({
          action: 'DUPLICATE_SOS_BLOCKED',
          actorUidHash: sha256Short(caller.uid),
          requestId,
          bloodGroup,
          district,
          channelSummary: `Duplicate of active request ${existingDup.requestId}`,
        });
        res.status(409).json({
          ok: false,
          code: 'DUPLICATE_REQUEST',
          existingRequestId: existingDup.requestId,
          message:
            'An identical active blood request for this hospital and blood group was submitted within the last 10 minutes. Expand the existing request instead of creating duplicates.',
        });
        return;
      }
    }

    if (!duplicateFingerprints.has(dupHash)) pruneBoundedMap(duplicateFingerprints);
    duplicateFingerprints.set(dupHash, { requestId, timestampMs: Date.now() });

    const notifiedHashes = new Set<string>(candidateDonorIds.map((uid) => sha256Short(uid)));
    if (!activeRequests.has(requestId)) pruneBoundedMap(activeRequests);
    activeRequests.set(requestId, {
      requestId,
      ownerUid: caller.uid,
      bloodGroup,
      district,
      status: 'ACTIVE',
      escalationLevel: 0,
      notifiedDonorHashes: notifiedHashes,
      createdAtMs: Date.now(),
      lastEscalatedAtMs: Date.now(),
    });

    const caps = getNotificationCapabilities();
    const safeSmsHospital = hospitalName
      .replace(/https?:\/\/\S+|www\.\S+/gi, '')
      .replace(/[\r\n<>]/g, ' ')
      .trim()
      .slice(0, 90);
    const safeSmsDistrict = district
      .replace(/https?:\/\/\S+|www\.\S+/gi, '')
      .replace(/[\r\n<>]/g, ' ')
      .trim()
      .slice(0, 40);
    const smsText = `[BloodSearch Emergency] ${bloodGroup} blood needed (${urgency}) at ${safeSmsHospital}, ${safeSmsDistrict}. Open BloodSearch to respond or confirm availability.`;
    const smsResult = await dispatchLegitimateSmsIfConfigured(optedInSmsPhones, smsText);

    const pushStatus = caps.webPushConfigured
      ? 'WEB_PUSH_VAPID_READY'
      : 'IN_APP_REALTIME_AND_LOCAL_NOTIFICATIONS';

    recordAudit({
      action: 'SOS_DISPATCH_VALIDATED',
      actorUidHash: sha256Short(caller.uid),
      requestId,
      bloodGroup,
      district,
      escalationLevel: 0,
      channelSummary: `donors=${candidateDonorIds.length}, push=${pushStatus}, sms=${smsResult.status}(${smsResult.sentCount})`,
    });

    res.json({
      ok: true,
      requestId,
      escalationTier: ESCALATION_TIERS[0],
      nextEscalationAtIso: new Date(Date.now() + escalationIntervalMinutes * 60 * 1000).toISOString(),
      channels: {
        inAppRealtime: 'DISPATCH_AUTHORIZED',
        pushStatus,
        pushNote:
          pushStatus === 'WEB_PUSH_VAPID_READY'
            ? 'Web Push VAPID notifications active.'
            : 'Real-time Neon PostgreSQL + WebSocket/SSE alerts and browser local notifications dispatched; call opted-in donors directly for fastest response.',
        smsStatus: smsResult.status,
        smsSentCount: smsResult.sentCount,
        smsNote: smsResult.fallbackMessage,
      },
      honestDeliveryNotice:
        'Dispatched notifications indicate server/database delivery only and do not guarantee a donor has seen or read the alert. Call opted-in available donors directly while waiting.',
    });
  });

  app.post('/api/emergency/escalate', async (req: Request, res: Response) => {
    const caller = await verifyCallerSession(req);
    if (!caller || !caller.emailVerified) {
      res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Verified authenticated session is required to escalate a blood request.',
      });
      return;
    }

    const body = req.body || {};
    const requestId = String(body.requestId || '').trim();
    const requestedLevel = Number(body.nextLevel);
    const newlyMatchedIds: string[] = Array.isArray(body.newlyMatchedDonorIds)
      ? body.newlyMatchedDonorIds.map((id: unknown) => String(id || '').trim()).filter(Boolean).slice(0, 50)
      : [];

    if (!requestId || !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
      res.status(400).json({ ok: false, code: 'INVALID_REQUEST_ID', message: 'Invalid requestId.' });
      return;
    }

    const tracked = activeRequests.get(requestId);
    if (tracked && tracked.ownerUid !== caller.uid) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Only the seeker who created this blood request can escalate it.',
      });
      return;
    }

    if (tracked && tracked.status !== 'ACTIVE') {
      res.status(409).json({
        ok: false,
        code: 'REQUEST_INACTIVE',
        message: `Cannot escalate request because its status is ${tracked.status}. Future alerts are stopped.`,
      });
      return;
    }

    const escRate = checkRateLimit(`escalate:uid:${caller.uid}`, 6, 15 * 60 * 1000);
    if (!escRate.allowed) {
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterSec: escRate.retryAfterSec,
        message: `Escalation rate limit reached. Try again in ${escRate.retryAfterSec}s or call donors directly.`,
      });
      return;
    }

    const currentLevel = tracked ? tracked.escalationLevel : 0;
    const nextLevel = Number.isFinite(requestedLevel)
      ? Math.min(ESCALATION_TIERS.length - 1, Math.max(currentLevel + 1, requestedLevel))
      : Math.min(ESCALATION_TIERS.length - 1, currentLevel + 1);

    const tier = ESCALATION_TIERS[nextLevel] || ESCALATION_TIERS[ESCALATION_TIERS.length - 1]!;

    const dedupedNewDonorIds = newlyMatchedIds.filter((uid) => {
      const h = sha256Short(uid);
      if (tracked?.notifiedDonorHashes.has(h)) return false;
      tracked?.notifiedDonorHashes.add(h);
      return true;
    });

    if (tracked) {
      tracked.escalationLevel = nextLevel;
      tracked.lastEscalatedAtMs = Date.now();
    } else {
      activeRequests.set(requestId, {
        requestId,
        ownerUid: caller.uid,
        bloodGroup: String(body.bloodGroup || ''),
        district: String(body.district || ''),
        status: 'ACTIVE',
        escalationLevel: nextLevel,
        notifiedDonorHashes: new Set(newlyMatchedIds.map((uid) => sha256Short(uid))),
        createdAtMs: Date.now(),
        lastEscalatedAtMs: Date.now(),
      });
    }

    recordAudit({
      action: 'SOS_ESCALATION_TRIGGERED',
      actorUidHash: sha256Short(caller.uid),
      requestId,
      escalationLevel: nextLevel,
      channelSummary: `tier=${tier.labelEn}, newlyEligible=${dedupedNewDonorIds.length}`,
    });

    res.json({
      ok: true,
      requestId,
      escalationTier: tier,
      dedupedNewDonorIds,
      skippedDuplicatesCount: newlyMatchedIds.length - dedupedNewDonorIds.length,
    });
  });

  app.post('/api/emergency/stop', async (req: Request, res: Response) => {
    const caller = await verifyCallerSession(req);
    if (!caller || !caller.emailVerified) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Verified authentication required.' });
      return;
    }

    const stopRate = checkRateLimit(`stop:uid:${caller.uid}`, 12, 10 * 60 * 1000);
    if (!stopRate.allowed) {
      res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterSec: stopRate.retryAfterSec,
        message: 'Too many stop requests in a short window.',
      });
      return;
    }

    const body = req.body || {};
    const requestId = String(body.requestId || '').trim();
    const reason = String(body.reason || 'CANCELLED').toUpperCase();
    const finalStatus: 'FULFILLED' | 'CANCELLED' | 'EXPIRED' =
      reason === 'FULFILLED' ? 'FULFILLED' : reason === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';

    if (!requestId || requestId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
      res.status(400).json({ ok: false, code: 'INVALID_REQUEST_ID', message: 'Invalid requestId.' });
      return;
    }

    const tracked = activeRequests.get(requestId);
    if (tracked && tracked.ownerUid !== caller.uid) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Only the request author can stop alerts.' });
      return;
    }

    if (tracked) {
      tracked.status = finalStatus;
    } else {
      activeRequests.set(requestId, {
        requestId,
        ownerUid: caller.uid,
        bloodGroup: '',
        district: '',
        status: finalStatus,
        escalationLevel: 0,
        notifiedDonorHashes: new Set(),
        createdAtMs: Date.now(),
        lastEscalatedAtMs: Date.now(),
      });
    }

    recordAudit({
      action: 'SOS_ALERT_STOPPED',
      actorUidHash: sha256Short(caller.uid),
      requestId,
      channelSummary: `stopped=${finalStatus}`,
    });

    res.json({
      ok: true,
      requestId,
      status: finalStatus,
      alertsHalted: true,
    });
  });

  // =========================================================================
  // SECURE OTP AUTHENTICATION ENDPOINTS (/api/auth/otp/*)
  // =========================================================================
  const extractClientIp = (req: Request): string => {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0]!.trim();
    }
    if (Array.isArray(xff) && xff.length > 0) {
      return String(xff[0]).trim();
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
  };

  app.get('/api/auth/otp/config', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      ...otpService.getPublicCapabilities(),
    });
  });

  app.post('/api/auth/otp/send', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body || {};
    const rawPhone = String(body.phone || '').slice(0, 32);
    const preferDevSandbox = body.preferDevSandbox === true;
    const clientIp = extractClientIp(req);

    const outcome = await otpService.requestOtp({
      rawPhone,
      clientIp,
      preferDevSandbox,
    });

    recordAudit({
      action: outcome.body.ok ? 'OTP_CHALLENGE_ISSUED' : 'OTP_CHALLENGE_BLOCKED',
      actorUidHash: sha256Short(outcome.body.phoneE164 || rawPhone || 'invalid'),
      requestId: outcome.body.challengeId ? outcome.body.challengeId.slice(0, 16) : 'otp_send',
      channelSummary: `mode=${outcome.body.deliveryMode || 'NONE'}, code=${outcome.body.code}`,
    });

    res.status(outcome.httpStatus).json(outcome.body);
  });

  app.post('/api/auth/otp/verify', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body || {};
    const challengeId = String(body.challengeId || '').slice(0, 80);
    const rawPhone = String(body.phone || '').slice(0, 32);
    const otpCode = String(body.otp || '').slice(0, 12);
    const clientIp = extractClientIp(req);

    const outcome = otpService.verifyOtp({
      challengeId,
      rawPhone,
      otpCode,
      clientIp,
    });

    recordAudit({
      action: outcome.body.ok ? 'OTP_CHALLENGE_VERIFIED' : 'OTP_CHALLENGE_BLOCKED',
      actorUidHash: sha256Short(outcome.body.phoneE164 || rawPhone || 'invalid'),
      requestId: challengeId ? challengeId.slice(0, 16) : 'otp_verify',
      channelSummary: `mode=${outcome.body.deliveryMode || 'NONE'}, result=${outcome.body.code}`,
    });

    if (outcome.body.ok && outcome.body.phoneE164) {
      try {
        const { db } = await ensureMainPostgresReady();
        if (db) {
          const neonSession = await authenticateVerifiedPhoneInNeonTx(db, {
            phoneE164: outcome.body.phoneE164,
            isDevSandbox: outcome.body.deliveryMode === 'DEV_SANDBOX',
            ipHash: extractHashedClientIp(req),
            userAgent: String(req.headers['user-agent'] || ''),
          });
          setOpaqueSessionCookie(req, res, neonSession.sessionToken, SESSION_TTL_MS);
          res.status(outcome.httpStatus).json({
            ...outcome.body,
            user: neonSession.userProfile,
            csrfToken: neonSession.csrfToken,
            neonSessionToken: neonSession.sessionToken,
          });
          return;
        }
      } catch {
        // Fall through to standard OTP verification payload
      }
    }

    res.status(outcome.httpStatus).json(outcome.body);
  });

  app.post('/api/auth/otp/session', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearerToken || String(req.body?.sessionToken || '').trim();
    const verified = otpService.verifyDevSandboxSessionToken(token);
    if (!verified.valid) {
      res.status(401).json({ ok: false, code: 'INVALID_DEV_OTP_SESSION' });
      return;
    }
    res.json({
      ok: true,
      session: {
        uid: verified.uid,
        phoneE164: verified.phoneE164,
        operator: verified.operator,
        role: 'USER',
        adminEligible: false,
        isDevSandbox: true,
        expiresAtMs: verified.expiresAtMs,
      },
    });
  });

  app.post('/api/auth/otp/logout', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearerToken || String(req.body?.sessionToken || '').trim();
    otpService.revokeDevSandboxSessionToken(token);
    res.json({ ok: true });
  });

  const serveVersionPayload = (req: Request, res: Response) => {
    const clientIp = extractClientIp(req);
    const verRate = checkRateLimit(`ver:ip:${clientIp}`, 60, 60 * 1000);
    if (!verRate.allowed) {
      res.status(429).json({ ok: false, code: 'RATE_LIMITED', retryAfterSec: verRate.retryAfterSec });
      return;
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    let pkgVersion = '2.5.0';
    let distBuildId = '';
    try {
      const distVersionPath = path.join(__dirname, 'dist', 'version.json');
      if (fs.existsSync(distVersionPath)) {
        const parsed = JSON.parse(fs.readFileSync(distVersionPath, 'utf8')) as {
          version?: string;
          buildId?: string;
        };
        if (parsed.version) pkgVersion = parsed.version;
        if (parsed.buildId) distBuildId = parsed.buildId;
      } else {
        const pkgPath = path.join(__dirname, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
        if (pkg.version) pkgVersion = pkg.version;
      }
    } catch {}
    res.json({
      ok: true,
      version: pkgVersion,
      buildId: distBuildId || `${pkgVersion}-live`,
    });
  };

  app.get('/api/app-version', serveVersionPayload);
  app.get('/version.json', serveVersionPayload);

  app.get('/api/audit/summary', async (req: Request, res: Response) => {
    const clientIp = extractClientIp(req);
    const audRate = checkRateLimit(`audit:ip:${clientIp}`, 30, 60 * 1000);
    if (!audRate.allowed) {
      res.status(429).json({ ok: false, code: 'RATE_LIMITED', retryAfterSec: audRate.retryAfterSec });
      return;
    }
    const caller = await verifyCallerSession(req);
    if (!caller || !caller.emailVerified) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }
    const superAdminEmailHash = process.env.SUPER_ADMIN_EMAIL
      ? sha256Short(process.env.SUPER_ADMIN_EMAIL.trim().toLowerCase())
      : '59aa667ae83942ae';
    const hashBufA = Buffer.from(caller.emailHash.padEnd(16, '0').slice(0, 16), 'utf8');
    const hashBufB = Buffer.from(superAdminEmailHash.padEnd(16, '0').slice(0, 16), 'utf8');
    const isSuperOwner =
      caller.rawEmailVerified !== false &&
      caller.emailHash.length === superAdminEmailHash.length &&
      crypto.timingSafeEqual(hashBufA, hashBufB);
    const callerUidHash = sha256Short(caller.uid);
    const visibleEvents = isSuperOwner
      ? auditTrail
      : auditTrail.filter((ev) => ev.actorUidHash === callerUidHash);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      totalEvents: visibleEvents.length,
      recentEvents: visibleEvents.slice(0, 25),
    });
  });

  return app;
}

if (process.env.BLOODSEARCH_SERVERLESS_MODE !== 'true') {
  const entryArg = process.argv[1] ? path.basename(process.argv[1]) : '';
  const isDirectEntry =
    !process.env.VERCEL &&
    !process.env.AWS_LAMBDA_FUNCTION_NAME &&
    (entryArg === 'server.ts' || entryArg === 'server.js');

  if (isDirectEntry) {
    (async () => {
      const PORT = Number(process.env.PORT) || 3000;
      const app = createEmergencyApiApp();
      const httpServer = http.createServer(app);

      // Attach RFC-6455 native WebSocket server (/ws) with server-verified Neon session authentication
      realtimeHub.attachWebSocketServer(httpServer, async (req) => {
        const { db } = await ensureMainPostgresReady();
        return verifyRawSessionFromHeaders(req, db);
      });

      if (process.env.NODE_ENV !== 'production') {
        let viteMiddleware: express.RequestHandler | null = null;
        let viteInitError: unknown = null;

        process.env.DISABLE_HMR = 'true';

        const viteReady = (async () => {
          try {
            const viteSpecifier = ['vi', 'te'].join('');
            const { createServer: createViteServer } = await import(viteSpecifier);
            const vite = await createViteServer({
              server: {
                middlewareMode: true,
                hmr: false,
                watch: null,
              },
              appType: 'spa',
            });
            viteMiddleware = vite.middlewares;
          } catch (err) {
            viteInitError = err;
            console.error('Failed to initialize Vite middleware:', err);
          }
        })();

        app.use(async (req, res, next) => {
          if (!viteMiddleware && !viteInitError) {
            await viteReady;
          }
          if (viteMiddleware) {
            viteMiddleware(req, res, next);
            return;
          }
          res.status(503).send('Dev server initializing...');
        });

        httpServer.listen(PORT, '0.0.0.0', () => {
          console.log(`BloodSearch server listening on http://0.0.0.0:${PORT}`);
        });
      } else {
        const distPath = path.join(__dirname, 'dist');
        app.use(
          express.static(distPath, {
            setHeaders(res, filePath) {
              if (filePath.endsWith('version.json') || filePath.endsWith('sw.js')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
              }
            },
          })
        );
        app.get('*', (_req: Request, res: Response) => {
          res.setHeader('Cache-Control', 'no-cache');
          res.sendFile(path.join(distPath, 'index.html'));
        });

        httpServer.listen(PORT, '0.0.0.0', () => {
          console.log(`BloodSearch server listening on http://0.0.0.0:${PORT}`);
        });
      }
    })().catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
  }
}
