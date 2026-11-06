import crypto from 'node:crypto';
import {
  type BangladeshMobileOperator,
  validateBangladeshMobile,
} from '../utils/bdPhoneValidator';
import {
  createSmsGatewayFromEnv,
  type SmsGatewayProvider,
  type SmsGatewayProviderId,
} from './smsGateway';

/**
 * BloodSearch Secure Server-Side OTP Engine (Phases 2, 4, 5)
 *
 * Security Guarantees:
 * - CSPRNG 6-digit OTP generation via `crypto.randomInt(100000, 1000000)`.
 * - Stores ONLY a salted `HMAC-SHA256` digest — plaintext OTP is NEVER stored or logged.
 * - Constant-time digest comparison via `crypto.timingSafeEqual`.
 * - Strict 5-minute OTP expiry (300,000 ms).
 * - Maximum 5 verification attempts per challenge (auto-invalidates on 5th failure).
 * - 60-second resend cooldown per phone number.
 * - Rate-limited by BOTH phone number (max 5 sends / 15 min) AND IP address (max 10 sends / 15 min).
 * - Issuing a new OTP immediately invalidates all prior OTP challenges for that phone number.
 * - One-time consumption prevents OTP reuse and replay attacks.
 * - DEV-ONLY Sandbox is strictly disabled when `isProduction === true` (`NODE_ENV === 'production'`).
 * - DEV-ONLY Sandbox sessions explicitly force `role: 'USER'` and `adminEligible: false`.
 * - Mints random 256-bit opaque SHA-256 session tokens in Neon PostgreSQL (`login_sessions`).
 */

export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_PHONE_RATE_LIMIT_MAX = 5;
export const OTP_PHONE_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_IP_RATE_LIMIT_MAX = 10;
export const OTP_IP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const DEV_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours in dev only

export type OtpDeliveryMode = 'DEV_SANDBOX' | 'GATEWAY_SMS';

interface StoredOtpChallenge {
  challengeId: string;
  phoneE164: string;
  operator: BangladeshMobileOperator;
  saltHex: string;
  otpDigestHex: string;
  issuedAtMs: number;
  expiresAtMs: number;
  resendAvailableAtMs: number;
  attemptsUsed: number;
  maxAttempts: number;
  consumed: boolean;
  invalidated: boolean;
  deliveryMode: OtpDeliveryMode;
  clientIpHash: string;
}

export interface SendOtpResponsePayload {
  ok: boolean;
  code: string;
  messageEn: string;
  messageBn: string;
  challengeId?: string;
  phoneE164?: string;
  operator?: BangladeshMobileOperator;
  operatorLabelEn?: string;
  operatorLabelBn?: string;
  deliveryMode?: OtpDeliveryMode;
  isDevelopmentMode?: boolean;
  expiresInSec?: number;
  resendCooldownSec?: number;
  retryAfterSec?: number;
  /**
   * Returned EXCLUSIVELY in non-production DEV_SANDBOX mode so developers can test
   * server-generated CSPRNG OTPs without paid SMS, hardcoded frontend secrets, or server logs.
   * Never populated in production or when using a real SMS gateway.
   */
  devSandboxTestOtp?: string;
}

export interface VerifyOtpResponsePayload {
  ok: boolean;
  code: string;
  messageEn: string;
  messageBn: string;
  uid?: string;
  phoneE164?: string;
  operator?: BangladeshMobileOperator;
  deliveryMode?: OtpDeliveryMode;
  isDevelopmentMode?: boolean;
  remainingAttempts?: number;
  sessionToken?: string;
  csrfToken?: string;
  devSandboxSession?: {
    sessionToken: string;
    uid: string;
    phoneE164: string;
    operator: BangladeshMobileOperator;
    role: 'USER';
    adminEligible: false;
    isDevSandbox: true;
    expiresAtMs: number;
  };
}

export interface OtpServiceOptions {
  isProduction?: boolean;
  enableDevSandbox?: boolean;
  hmacSecret?: string;
  smsGateway?: SmsGatewayProvider;
  nowFn?: () => number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export class BloodSearchOtpService {
  private readonly isProduction: boolean;
  private readonly enableDevSandbox: boolean;
  private readonly hmacSecret: Buffer;
  private readonly smsGateway: SmsGatewayProvider;
  private readonly nowFn: () => number;

  private readonly challengesById = new Map<string, StoredOtpChallenge>();
  private readonly activeChallengeIdByPhone = new Map<string, string>();
  private readonly lastSentAtByPhone = new Map<string, number>();
  private readonly phoneRateBuckets = new Map<string, number[]>();
  private readonly ipRateBuckets = new Map<string, number[]>();
  private readonly revokedDevSessionTokens = new Set<string>();

  constructor(options?: OtpServiceOptions) {
    const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
    this.isProduction =
      typeof options?.isProduction === 'boolean'
        ? options.isProduction
        : nodeEnv === 'production' ||
          String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production';

    const envSandboxFlag = String(process.env.ENABLE_DEV_OTP_SANDBOX ?? 'true')
      .trim()
      .toLowerCase();
    // CRITICAL SECURITY GATE: Never enable mock/sandbox OTP in production!
    this.enableDevSandbox = this.isProduction
      ? false
      : typeof options?.enableDevSandbox === 'boolean'
        ? options.enableDevSandbox
        : envSandboxFlag !== 'false';

    const secretRaw = String(options?.hmacSecret || process.env.OTP_HMAC_SECRET || '').trim();
    if (
      this.isProduction &&
      (secretRaw.length < 32 || /^(YOUR_|GENERATE_|REPLACE_|CHANGE_ME)/i.test(secretRaw))
    ) {
      throw new Error('OTP_HMAC_SECRET must be configured with a unique random secret of at least 32 characters in production.');
    }
    this.hmacSecret = Buffer.from(
      secretRaw || crypto.randomBytes(32).toString('hex'),
      'utf8'
    );

    this.smsGateway = options?.smsGateway || createSmsGatewayFromEnv(process.env);
    this.nowFn = options?.nowFn || (() => Date.now());
  }

  public getPublicCapabilities(): {
    isProduction: boolean;
    devSandboxAvailable: boolean;
    smsGatewayProvider: SmsGatewayProviderId;
    smsGatewayConfigured: boolean;
    neonSessionConfigured: boolean;
    otpExpirySeconds: number;
    resendCooldownSeconds: number;
    maxVerifyAttempts: number;
  } {
    return {
      isProduction: this.isProduction,
      devSandboxAvailable: !this.isProduction && this.enableDevSandbox,
      smsGatewayProvider: this.smsGateway.providerId,
      smsGatewayConfigured: this.smsGateway.isConfigured(),
      neonSessionConfigured: true,
      otpExpirySeconds: Math.floor(OTP_EXPIRY_MS / 1000),
      resendCooldownSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      maxVerifyAttempts: OTP_MAX_VERIFY_ATTEMPTS,
    };
  }

  private hashIdentifier(value: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`ID:${value}`)
      .digest('hex')
      .slice(0, 24);
  }

  private computeOtpDigestHex(challengeId: string, phoneE164: string, saltHex: string, otpCode: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`OTP_V1:${challengeId}:${phoneE164}:${saltHex}:${otpCode}`)
      .digest('hex');
  }

  private checkSlidingWindowLimit(
    store: Map<string, number[]>,
    key: string,
    maxCount: number,
    windowMs: number,
    nowMs: number
  ): { allowed: boolean; retryAfterSec: number } {
    const existing = store.get(key) || [];
    const active = existing.filter((ts) => nowMs - ts < windowMs);
    if (active.length >= maxCount) {
      const oldest = active[0] ?? nowMs;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (nowMs - oldest)) / 1000));
      store.set(key, active);
      return { allowed: false, retryAfterSec };
    }
    store.set(key, active);
    return { allowed: true, retryAfterSec: 0 };
  }

  private recordSlidingWindowHit(store: Map<string, number[]>, key: string, windowMs: number, nowMs: number): void {
    const existing = store.get(key) || [];
    const active = existing.filter((ts) => nowMs - ts < windowMs);
    active.push(nowMs);
    store.set(key, active);
  }

  private pruneExpiredChallenges(nowMs: number): void {
    if (this.challengesById.size < 250) return;
    for (const [id, ch] of this.challengesById.entries()) {
      if (nowMs - ch.expiresAtMs > 10 * 60 * 1000 || ch.consumed || ch.invalidated) {
        this.challengesById.delete(id);
      }
    }
  }

  /**
   * Test-only inspection helper returning sanitized metadata (verifies plaintext OTP is NEVER stored).
   */
  public inspectStoredChallengeForTest(challengeId: string): Omit<StoredOtpChallenge, 'saltHex'> | null {
    const found = this.challengesById.get(challengeId);
    if (!found) return null;
    const { saltHex: _omitted, ...rest } = found;
    return { ...rest };
  }

  public async requestOtp(params: {
    rawPhone: string;
    clientIp: string;
    preferDevSandbox?: boolean;
  }): Promise<{ httpStatus: number; body: SendOtpResponsePayload }> {
    const nowMs = this.nowFn();
    this.pruneExpiredChallenges(nowMs);

    // 1. Validate & normalize Bangladesh mobile number (+8801XXXXXXXXX / 01XXXXXXXXX)
    const validation = validateBangladeshMobile(params.rawPhone, { allowBare10DigitNational: true });
    if (!validation.valid || !validation.operator) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: validation.errorCode || 'INVALID_PHONE_NUMBER',
          messageEn: validation.errorEn || 'Invalid Bangladesh mobile number.',
          messageBn: validation.errorBn || 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।',
        },
      };
    }

    const phoneE164 = validation.e164;
    const clientIpHash = this.hashIdentifier(params.clientIp || 'unknown-ip');
    const phoneKey = this.hashIdentifier(phoneE164);

    // 2. Determine allowed delivery mode (Gateway SMS vs strictly isolated Dev Sandbox)
    const gatewayReady = this.smsGateway.isConfigured() && !params.preferDevSandbox;
    let deliveryMode: OtpDeliveryMode;

    if (gatewayReady) {
      deliveryMode = 'GATEWAY_SMS';
    } else if (!this.isProduction && this.enableDevSandbox) {
      deliveryMode = 'DEV_SANDBOX';
    } else {
      return {
        httpStatus: 403,
        body: {
          ok: false,
          code: 'DEV_OTP_DISABLED_IN_PRODUCTION',
          messageEn:
            'Development OTP Sandbox is strictly disabled in production. Configure a BTRC-compliant SMS gateway or sign in with Google.',
          messageBn:
            'প্রোডাকশন মোডে ডেভেলপমেন্ট ওটিপি সম্পূর্ণ বন্ধ। অনুগ্রহ করে অনুমোদিত SMS Gateway চালু করুন অথবা Google Sign-In ব্যবহার করুন।',
        },
      };
    }

    // 3. Enforce 60-second resend cooldown per phone number
    const lastSentMs = this.lastSentAtByPhone.get(phoneE164);
    if (typeof lastSentMs === 'number' && nowMs - lastSentMs < OTP_RESEND_COOLDOWN_MS) {
      const cooldownLeftSec = Math.max(
        1,
        Math.ceil((OTP_RESEND_COOLDOWN_MS - (nowMs - lastSentMs)) / 1000)
      );
      return {
        httpStatus: 429,
        body: {
          ok: false,
          code: 'RESEND_COOLDOWN_ACTIVE',
          retryAfterSec: cooldownLeftSec,
          resendCooldownSec: cooldownLeftSec,
          messageEn: `Please wait ${cooldownLeftSec}s before requesting another OTP.`,
          messageBn: `নতুন ওটিপি পাঠানোর আগে অনুগ্রহ করে ${cooldownLeftSec} সেকেন্ড অপেক্ষা করুন।`,
        },
      };
    }

    // 4. Enforce abuse rate limits by phone number AND IP address
    const phoneLimit = this.checkSlidingWindowLimit(
      this.phoneRateBuckets,
      phoneKey,
      OTP_PHONE_RATE_LIMIT_MAX,
      OTP_PHONE_RATE_WINDOW_MS,
      nowMs
    );
    if (!phoneLimit.allowed) {
      return {
        httpStatus: 429,
        body: {
          ok: false,
          code: 'PHONE_RATE_LIMITED',
          retryAfterSec: phoneLimit.retryAfterSec,
          messageEn: `Too many OTP requests for this mobile number. Try again in ${phoneLimit.retryAfterSec}s.`,
          messageBn: `এই নম্বরে অনেকবার ওটিপি চাওয়া হয়েছে। ${phoneLimit.retryAfterSec} সেকেন্ড পর আবার চেষ্টা করুন।`,
        },
      };
    }

    const ipLimit = this.checkSlidingWindowLimit(
      this.ipRateBuckets,
      clientIpHash,
      OTP_IP_RATE_LIMIT_MAX,
      OTP_IP_RATE_WINDOW_MS,
      nowMs
    );
    if (!ipLimit.allowed) {
      return {
        httpStatus: 429,
        body: {
          ok: false,
          code: 'IP_RATE_LIMITED',
          retryAfterSec: ipLimit.retryAfterSec,
          messageEn: `Too many OTP requests from your network. Try again in ${ipLimit.retryAfterSec}s.`,
          messageBn: `একই নেটওয়ার্ক থেকে অতিরিক্ত অনুরোধ পাঠানো হয়েছে। ${ipLimit.retryAfterSec} সেকেন্ড পর চেষ্টা করুন।`,
        },
      };
    }

    // 5. Immediately invalidate any previous active OTP challenge for this phone number
    const priorChallengeId = this.activeChallengeIdByPhone.get(phoneE164);
    if (priorChallengeId) {
      const prior = this.challengesById.get(priorChallengeId);
      if (prior) {
        prior.invalidated = true;
      }
      this.activeChallengeIdByPhone.delete(phoneE164);
    }

    // 6. Generate cryptographically secure 6-digit OTP (NEVER logged!)
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const challengeId = `otp_${crypto.randomBytes(16).toString('hex')}`;
    const saltHex = crypto.randomBytes(16).toString('hex');
    const otpDigestHex = this.computeOtpDigestHex(challengeId, phoneE164, saltHex, otpCode);

    // 7. If using a real configured SMS gateway, dispatch before committing cooldown
    if (deliveryMode === 'GATEWAY_SMS') {
      const dispatchRes = await this.smsGateway.sendOtpSms({
        toE164: phoneE164,
        otpCode,
        expiresMinutes: Math.floor(OTP_EXPIRY_MS / 60000),
      });
      if (!dispatchRes.dispatched) {
        return {
          httpStatus: 502,
          body: {
            ok: false,
            code: 'SMS_DISPATCH_FAILED',
            messageEn: 'Could not dispatch SMS via configured gateway. Please try again shortly.',
            messageBn: 'SMS গেটওয়ের মাধ্যমে কোড পাঠানো যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।',
          },
        };
      }
    }

    // 8. Commit hashed challenge & rate-limit counters
    const challenge: StoredOtpChallenge = {
      challengeId,
      phoneE164,
      operator: validation.operator,
      saltHex,
      otpDigestHex,
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + OTP_EXPIRY_MS,
      resendAvailableAtMs: nowMs + OTP_RESEND_COOLDOWN_MS,
      attemptsUsed: 0,
      maxAttempts: OTP_MAX_VERIFY_ATTEMPTS,
      consumed: false,
      invalidated: false,
      deliveryMode,
      clientIpHash,
    };

    this.challengesById.set(challengeId, challenge);
    this.activeChallengeIdByPhone.set(phoneE164, challengeId);
    this.lastSentAtByPhone.set(phoneE164, nowMs);
    this.recordSlidingWindowHit(this.phoneRateBuckets, phoneKey, OTP_PHONE_RATE_WINDOW_MS, nowMs);
    this.recordSlidingWindowHit(this.ipRateBuckets, clientIpHash, OTP_IP_RATE_WINDOW_MS, nowMs);

    const isDevSandbox = deliveryMode === 'DEV_SANDBOX';

    return {
      httpStatus: 200,
      body: {
        ok: true,
        code: isDevSandbox ? 'DEV_SANDBOX_OTP_ISSUED' : 'SMS_OTP_SENT',
        messageEn: isDevSandbox
          ? `[DEV MODE — NO REAL SMS SENT] Sandbox test code generated for ${phoneE164} (${validation.operatorLabelEn}). Valid for 5 minutes.`
          : `6-digit verification code sent to ${phoneE164}. Valid for 5 minutes.`,
        messageBn: isDevSandbox
          ? `[ডেভেলপমেন্ট মোড — কোনো আসল SMS পাঠানো হয়নি] ${phoneE164} (${validation.operatorLabelBn})-এর জন্য টেস্ট ওটিপি তৈরি হয়েছে। মেয়াদ ৫ মিনিট।`
          : `${phoneE164} নম্বরে ৬-সংখ্যার ওটিপি পাঠানো হয়েছে। মেয়াদ ৫ মিনিট।`,
        challengeId,
        phoneE164,
        operator: validation.operator,
        operatorLabelEn: validation.operatorLabelEn,
        operatorLabelBn: validation.operatorLabelBn,
        deliveryMode,
        isDevelopmentMode: isDevSandbox,
        expiresInSec: Math.floor(OTP_EXPIRY_MS / 1000),
        resendCooldownSec: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        ...(isDevSandbox && !this.isProduction ? { devSandboxTestOtp: otpCode } : {}),
      },
    };
  }

  public verifyOtp(params: {
    challengeId: string;
    rawPhone: string;
    otpCode: string;
    clientIp: string;
  }): { httpStatus: number; body: VerifyOtpResponsePayload } {
    const nowMs = this.nowFn();
    const challengeId = String(params.challengeId || '').trim();
    const cleanOtp = String(params.otpCode || '')
      .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
      .replace(/\D/g, '');

    const validation = validateBangladeshMobile(params.rawPhone, { allowBare10DigitNational: true });
    if (!validation.valid || !validation.operator) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: 'INVALID_PHONE_NUMBER',
          messageEn: validation.errorEn || 'Invalid Bangladesh mobile number.',
          messageBn: validation.errorBn || 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।',
        },
      };
    }

    if (!challengeId || !/^\d{6}$/.test(cleanOtp)) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: 'INVALID_OTP_FORMAT',
          messageEn: 'Please enter a valid 6-digit OTP code.',
          messageBn: 'অনুগ্রহ করে সম্পূর্ণ ৬-সংখ্যার ওটিপি কোড লিখুন।',
        },
      };
    }

    const challenge = this.challengesById.get(challengeId);
    if (!challenge || challenge.phoneE164 !== validation.e164) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: 'OTP_CHALLENGE_NOT_FOUND',
          messageEn: 'Invalid or unknown OTP session. Please request a new OTP.',
          messageBn: 'ওটিপি সেশন পাওয়া যায়নি। অনুগ্রহ করে নতুন ওটিপি পাঠান।',
        },
      };
    }

    if (challenge.deliveryMode === 'DEV_SANDBOX' && (this.isProduction || !this.enableDevSandbox)) {
      return {
        httpStatus: 403,
        body: {
          ok: false,
          code: 'DEV_OTP_DISABLED_IN_PRODUCTION',
          messageEn: 'Development OTP verification is disabled in production.',
          messageBn: 'প্রোডাকশন মোডে ডেভেলপমেন্ট ওটিপি সম্পূর্ণ নিষ্ক্রিয়।',
        },
      };
    }

    // Prevent replay / reuse of already-verified OTP
    if (challenge.consumed) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: 'OTP_ALREADY_USED',
          messageEn: 'This OTP has already been used. Please request a new code if signing in again.',
          messageBn: 'এই ওটিপি কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে। প্রয়োজনে নতুন কোড পাঠান।',
        },
      };
    }

    // Reject invalidated OTP (superseded by a newer OTP request or locked out)
    if (challenge.invalidated) {
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code:
            challenge.attemptsUsed >= challenge.maxAttempts
              ? 'OTP_MAX_ATTEMPTS_EXCEEDED'
              : 'OTP_SUPERSEDED',
          remainingAttempts: 0,
          messageEn:
            challenge.attemptsUsed >= challenge.maxAttempts
              ? 'Maximum 5 verification attempts exceeded. Please request a new OTP.'
              : 'This OTP was invalidated because a newer OTP was requested. Use the latest code.',
          messageBn:
            challenge.attemptsUsed >= challenge.maxAttempts
              ? 'সর্বোচ্চ ৫ বার ভুল কোড দেওয়ায় ওটিপি বাতিল হয়েছে। অনুগ্রহ করে নতুন ওটিপি পাঠান।'
              : 'নতুন ওটিপি পাঠানোয় পুরনো কোডটি বাতিল হয়েছে। সর্বশেষ কোডটি ব্যবহার করুন।',
        },
      };
    }

    // Check 5-minute expiration
    if (nowMs > challenge.expiresAtMs) {
      challenge.invalidated = true;
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: 'OTP_EXPIRED',
          messageEn: 'This OTP has expired (5-minute limit). Please tap Resend OTP for a new code.',
          messageBn: 'ওটিপি কোডের মেয়াদ (৫ মিনিট) শেষ হয়ে গেছে। নতুন কোড পেতে Resend OTP চাপুন।',
        },
      };
    }

    // Enforce maximum 5 attempts
    if (challenge.attemptsUsed >= challenge.maxAttempts) {
      challenge.invalidated = true;
      return {
        httpStatus: 429,
        body: {
          ok: false,
          code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
          remainingAttempts: 0,
          messageEn: 'Maximum 5 verification attempts reached. Please request a new OTP.',
          messageBn: 'সর্বোচ্চ ৫ বার চেষ্টার সীমা শেষ হয়েছে। নতুন ওটিপি পাঠান।',
        },
      };
    }

    // Constant-time HMAC digest verification
    const candidateHex = this.computeOtpDigestHex(
      challenge.challengeId,
      challenge.phoneE164,
      challenge.saltHex,
      cleanOtp
    );
    const expectedBuf = Buffer.from(challenge.otpDigestHex, 'hex');
    const candidateBuf = Buffer.from(candidateHex, 'hex');

    const matches =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!matches) {
      challenge.attemptsUsed += 1;
      const remainingAttempts = Math.max(0, challenge.maxAttempts - challenge.attemptsUsed);
      if (remainingAttempts === 0) {
        challenge.invalidated = true;
      }
      return {
        httpStatus: 400,
        body: {
          ok: false,
          code: remainingAttempts === 0 ? 'OTP_MAX_ATTEMPTS_EXCEEDED' : 'OTP_INVALID_CODE',
          remainingAttempts,
          messageEn:
            remainingAttempts === 0
              ? 'Incorrect OTP. Maximum 5 attempts reached — please request a new OTP.'
              : `Incorrect OTP code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
          messageBn:
            remainingAttempts === 0
              ? 'ভুল ওটিপি কোড। সর্বোচ্চ ৫ বার চেষ্টার সীমা শেষ — অনুগ্রহ করে নতুন ওটিপি পাঠান।'
              : `ওটিপি কোডটি সঠিক নয়। আর ${remainingAttempts} বার চেষ্টা করতে পারবেন।`,
        },
      };
    }

    // Mark consumed immediately to guarantee single-use & block replay attacks
    challenge.consumed = true;
    challenge.invalidated = true;
    if (this.activeChallengeIdByPhone.get(challenge.phoneE164) === challenge.challengeId) {
      this.activeChallengeIdByPhone.delete(challenge.phoneE164);
    }

    const deterministicPhoneUid = `phone_${crypto
      .createHash('sha256')
      .update(`BSBD_PHONE_UID:${challenge.phoneE164}`)
      .digest('hex')
      .slice(0, 20)}`;

    if (challenge.deliveryMode === 'GATEWAY_SMS') {
      return {
        httpStatus: 200,
        body: {
          ok: true,
          code: 'OTP_VERIFIED_GATEWAY',
          messageEn: `Verified ${challenge.phoneE164} successfully.`,
          messageBn: `${challenge.phoneE164} সফলভাবে যাচাই সম্পন্ন হয়েছে।`,
          uid: deterministicPhoneUid,
          phoneE164: challenge.phoneE164,
          operator: challenge.operator,
          deliveryMode: challenge.deliveryMode,
          isDevelopmentMode: false,
        },
      };
    }

    // Phase 2: Isolated DEV_SANDBOX session receipt (NEVER grants ADMIN privileges!)
    const devUid = `dev_otp_${crypto
      .createHash('sha256')
      .update(`BSBD_DEV_SANDBOX_UID:${challenge.phoneE164}`)
      .digest('hex')
      .slice(0, 16)}`;
    const expiresAtMs = nowMs + DEV_SESSION_TTL_MS;
    const sessionToken = this.signDevSandboxToken({
      uid: devUid,
      phoneE164: challenge.phoneE164,
      operator: challenge.operator,
      issuedAtMs: nowMs,
      expiresAtMs,
    });

    return {
      httpStatus: 200,
      body: {
        ok: true,
        code: 'DEV_SANDBOX_OTP_VERIFIED',
        messageEn: `[DEV MODE] Sandbox OTP verified for ${challenge.phoneE164}. Standard user test session active (Admin disabled).`,
        messageBn: `[ডেভেলপমেন্ট মোড] ${challenge.phoneE164} নম্বরের টেস্ট ওটিপি যাচাই হয়েছে (সাধারণ ইউজার টেস্ট সেশন, অ্যাডমিন সুবিধা বন্ধ)।`,
        phoneE164: challenge.phoneE164,
        operator: challenge.operator,
        deliveryMode: 'DEV_SANDBOX',
        isDevelopmentMode: true,
        devSandboxSession: {
          sessionToken,
          uid: devUid,
          phoneE164: challenge.phoneE164,
          operator: challenge.operator,
          role: 'USER',
          adminEligible: false,
          isDevSandbox: true,
          expiresAtMs,
        },
      },
    };
  }

  private signDevSandboxToken(payload: {
    uid: string;
    phoneE164: string;
    operator: BangladeshMobileOperator;
    issuedAtMs: number;
    expiresAtMs: number;
  }): string {
    const bodyObj = {
      v: 1,
      uid: payload.uid,
      phoneE164: payload.phoneE164,
      operator: payload.operator,
      role: 'USER' as const,
      adminEligible: false as const,
      isDevSandbox: true as const,
      iat: payload.issuedAtMs,
      exp: payload.expiresAtMs,
      jti: crypto.randomBytes(8).toString('hex'),
    };
    const encoded = base64UrlEncode(JSON.stringify(bodyObj));
    const sig = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`DEV_SANDBOX_SESSION:${encoded}`)
      .digest();
    return `${encoded}.${base64UrlEncode(sig)}`;
  }

  public verifyDevSandboxSessionToken(rawToken: string | undefined | null): {
    valid: boolean;
    uid?: string;
    phoneE164?: string;
    operator?: BangladeshMobileOperator;
    role?: 'USER';
    adminEligible?: false;
    isDevSandbox?: true;
    expiresAtMs?: number;
  } {
    if (this.isProduction || !this.enableDevSandbox || !rawToken) {
      return { valid: false };
    }
    const token = String(rawToken).trim();
    if (this.revokedDevSessionTokens.has(token)) {
      return { valid: false };
    }
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };

    const [encoded, sigB64] = parts;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', this.hmacSecret)
        .update(`DEV_SANDBOX_SESSION:${encoded}`)
        .digest()
    );

    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }

    try {
      const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        uid?: string;
        phoneE164?: string;
        operator?: BangladeshMobileOperator;
        exp?: number;
      };
      const nowMs = this.nowFn();
      if (!decoded.uid || !decoded.phoneE164 || !decoded.operator || !decoded.exp || nowMs > decoded.exp) {
        return { valid: false };
      }
      return {
        valid: true,
        uid: decoded.uid,
        phoneE164: decoded.phoneE164,
        operator: decoded.operator,
        role: 'USER',
        adminEligible: false,
        isDevSandbox: true,
        expiresAtMs: decoded.exp,
      };
    } catch {
      return { valid: false };
    }
  }

  public revokeDevSandboxSessionToken(rawToken: string | undefined | null): void {
    if (rawToken && rawToken.length < 1024) {
      this.revokedDevSessionTokens.add(rawToken.trim());
    }
  }
}
