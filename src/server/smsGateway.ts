/**
 * Provider-Independent Bangladesh SMS Gateway Interface (Phase 6)
 *
 * Designed for future BTRC-compliant Bangladesh SMS gateway integration without
 * rebuilding the BloodSearch OTP or Neon PostgreSQL session authentication architecture.
 *
 * Supported pluggable providers (server-side only via environment variables):
 * - NONE (Default zero-cost development mode — makes zero external paid API calls)
 * - W3SMS (W3 SMS Bangladesh Gateway)
 * - ZENDSMS (ZendSMS Bangladesh Gateway)
 * - BTRC_CUSTOM (Generic BTRC-compliant HTTPS REST Gateway)
 *
 * SECURITY INVARIANTS:
 * - API keys are read strictly from server-side `process.env`.
 * - Outbound gateway URLs are validated to require HTTPS and block private/loopback SSRF targets.
 * - OTP plaintext values are NEVER logged anywhere in this module.
 */

export type SmsGatewayProviderId = 'NONE' | 'W3SMS' | 'ZENDSMS' | 'BTRC_CUSTOM';

export interface SmsOtpDispatchParams {
  toE164: string;
  otpCode: string;
  expiresMinutes: number;
}

export interface SmsOtpDispatchResult {
  dispatched: boolean;
  providerId: SmsGatewayProviderId;
  messageId?: string;
  errorCode?: string;
}

export interface SmsGatewayProvider {
  readonly providerId: SmsGatewayProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  sendOtpSms(params: SmsOtpDispatchParams): Promise<SmsOtpDispatchResult>;
}

export function isSafePublicHttpsEndpoint(rawUrl: string | undefined): boolean {
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

function buildBloodSearchSmsBody(otpCode: string, expiresMinutes: number): string {
  return `BloodSearch BD verification code: ${otpCode}. Valid for ${expiresMinutes} minutes. Never share this code with anyone.`;
}

/**
 * Default zero-cost no-op gateway used during free development & testing.
 * Makes zero external HTTP calls and incurs zero billing.
 */
export class DisabledNoOpSmsGateway implements SmsGatewayProvider {
  public readonly providerId: SmsGatewayProviderId = 'NONE';
  public readonly displayName = 'Disabled (Zero-Cost Development Mode)';

  public isConfigured(): boolean {
    return false;
  }

  public async sendOtpSms(_params: SmsOtpDispatchParams): Promise<SmsOtpDispatchResult> {
    return {
      dispatched: false,
      providerId: 'NONE',
      errorCode: 'SMS_GATEWAY_DISABLED',
    };
  }
}

/**
 * W3 SMS Bangladesh Adapter (server-side env configuration only; inactive until enabled in prod).
 */
export class W3SmsGatewayAdapter implements SmsGatewayProvider {
  public readonly providerId: SmsGatewayProviderId = 'W3SMS';
  public readonly displayName = 'W3 SMS Bangladesh';
  private readonly config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  };

  constructor(config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.config = config;
  }

  public isConfigured(): boolean {
    return (
      isSafePublicHttpsEndpoint(this.config.apiUrl) &&
      Boolean(this.config.apiKey && this.config.apiKey.trim().length >= 8) &&
      Boolean(this.config.senderId && this.config.senderId.trim().length >= 3)
    );
  }

  public async sendOtpSms(params: SmsOtpDispatchParams): Promise<SmsOtpDispatchResult> {
    if (!this.isConfigured() || !this.config.apiUrl) {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const httpFetch = this.config.fetchImpl || globalThis.fetch;
    try {
      const response = await httpFetch(this.config.apiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey!.trim()}`,
        },
        body: JSON.stringify({
          sender_id: this.config.senderId!.trim(),
          recipient: params.toE164.replace(/^\+/, ''),
          type: 'plain',
          message: buildBloodSearchSmsBody(params.otpCode, params.expiresMinutes),
        }),
      });

      if (!response.ok) {
        return {
          dispatched: false,
          providerId: this.providerId,
          errorCode: `HTTP_${response.status}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        dispatched: true,
        providerId: this.providerId,
        messageId: typeof data.request_id === 'string' ? data.request_id : undefined,
      };
    } catch {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'NETWORK_DISPATCH_FAILED',
      };
    }
  }
}

/**
 * ZendSMS Bangladesh Adapter (server-side env configuration only; inactive until enabled in prod).
 */
export class ZendSmsGatewayAdapter implements SmsGatewayProvider {
  public readonly providerId: SmsGatewayProviderId = 'ZENDSMS';
  public readonly displayName = 'ZendSMS Bangladesh';
  private readonly config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  };

  constructor(config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.config = config;
  }

  public isConfigured(): boolean {
    return (
      isSafePublicHttpsEndpoint(this.config.apiUrl) &&
      Boolean(this.config.apiKey && this.config.apiKey.trim().length >= 8) &&
      Boolean(this.config.senderId && this.config.senderId.trim().length >= 3)
    );
  }

  public async sendOtpSms(params: SmsOtpDispatchParams): Promise<SmsOtpDispatchResult> {
    if (!this.isConfigured() || !this.config.apiUrl) {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const httpFetch = this.config.fetchImpl || globalThis.fetch;
    try {
      const response = await httpFetch(this.config.apiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey!.trim(),
        },
        body: JSON.stringify({
          api_key: this.config.apiKey!.trim(),
          senderid: this.config.senderId!.trim(),
          number: params.toE164.replace(/^\+/, ''),
          message: buildBloodSearchSmsBody(params.otpCode, params.expiresMinutes),
        }),
      });

      if (!response.ok) {
        return {
          dispatched: false,
          providerId: this.providerId,
          errorCode: `HTTP_${response.status}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        dispatched: true,
        providerId: this.providerId,
        messageId: typeof data.message_id === 'string' ? data.message_id : undefined,
      };
    } catch {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'NETWORK_DISPATCH_FAILED',
      };
    }
  }
}

/**
 * Generic BTRC-Compliant Bangladesh SMS Gateway Adapter (supports SSL Wireless, BulkSMSBD, GreenWeb, etc. via HTTPS JSON).
 */
export class BtrcCompliantSmsGatewayAdapter implements SmsGatewayProvider {
  public readonly providerId: SmsGatewayProviderId = 'BTRC_CUSTOM';
  public readonly displayName = 'BTRC-Compliant Bangladesh SMS Gateway';
  private readonly config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  };

  constructor(config: {
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.config = config;
  }

  public isConfigured(): boolean {
    return (
      isSafePublicHttpsEndpoint(this.config.apiUrl) &&
      Boolean(this.config.apiKey && this.config.apiKey.trim().length >= 8) &&
      Boolean(this.config.senderId && this.config.senderId.trim().length >= 3)
    );
  }

  public async sendOtpSms(params: SmsOtpDispatchParams): Promise<SmsOtpDispatchResult> {
    if (!this.isConfigured() || !this.config.apiUrl) {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const httpFetch = this.config.fetchImpl || globalThis.fetch;
    try {
      const response = await httpFetch(this.config.apiUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey!.trim()}`,
        },
        body: JSON.stringify({
          senderId: this.config.senderId!.trim(),
          to: params.toE164,
          msisdn: params.toE164.replace(/^\+/, ''),
          text: buildBloodSearchSmsBody(params.otpCode, params.expiresMinutes),
        }),
      });

      if (!response.ok) {
        return {
          dispatched: false,
          providerId: this.providerId,
          errorCode: `HTTP_${response.status}`,
        };
      }

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        dispatched: true,
        providerId: this.providerId,
        messageId: typeof data.id === 'string' ? data.id : undefined,
      };
    } catch {
      return {
        dispatched: false,
        providerId: this.providerId,
        errorCode: 'NETWORK_DISPATCH_FAILED',
      };
    }
  }
}

export function createSmsGatewayFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch
): SmsGatewayProvider {
  const selected = String(env.OTP_SMS_PROVIDER || 'NONE')
    .trim()
    .toUpperCase();

  if (selected === 'W3SMS') {
    return new W3SmsGatewayAdapter({
      apiUrl: env.W3SMS_API_URL,
      apiKey: env.W3SMS_API_KEY,
      senderId: env.W3SMS_SENDER_ID,
      fetchImpl,
    });
  }

  if (selected === 'ZENDSMS') {
    return new ZendSmsGatewayAdapter({
      apiUrl: env.ZENDSMS_API_URL,
      apiKey: env.ZENDSMS_API_KEY,
      senderId: env.ZENDSMS_SENDER_ID,
      fetchImpl,
    });
  }

  if (selected === 'BTRC_CUSTOM') {
    return new BtrcCompliantSmsGatewayAdapter({
      apiUrl: env.BTRC_SMS_API_URL,
      apiKey: env.BTRC_SMS_API_KEY,
      senderId: env.BTRC_SMS_SENDER_ID,
      fetchImpl,
    });
  }

  return new DisabledNoOpSmsGateway();
}
