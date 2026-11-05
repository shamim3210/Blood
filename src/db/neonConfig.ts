import type { PoolConfig } from 'pg';

/**
 * BloodSearch — Neon PostgreSQL Connection Security & Environment Validator
 *
 * SECURITY MANDATES:
 * 1. Backend-only execution: immediately throws if accidentally imported into a browser/APK bundle.
 * 2. DATABASE_URL (pooled `-pooler` Neon endpoint) and DIRECT_DATABASE_URL (direct Neon endpoint for DDL/pg_dump)
 *    are read exclusively from server-side environment variables.
 * 3. Enforces TLS (`sslmode=verify-full` / `rejectUnauthorized: true`) for all cloud PostgreSQL connections
 *    and explicitly blocks insecure `sslmode=disable` or `sslmode=allow`.
 * 4. Redacts passwords/tokens before any diagnostic or log output.
 */

if (typeof window !== 'undefined' || typeof document !== 'undefined') {
  throw new Error(
    'FATAL_SECURITY_VIOLATION: Neon PostgreSQL module (src/db/neonConfig.ts) must never be imported in browser or APK frontend code.'
  );
}

export type DbCutoverMode = 'NEON_PRIMARY' | 'MAINTENANCE_READ_ONLY';

export interface ValidatedNeonConnectionInfo {
  configured: boolean;
  connectionString: string;
  redactedUrl: string;
  host: string;
  database: string;
  isNeonHost: boolean;
  isPooledEndpoint: boolean;
  sslMode: string;
  environment: 'development' | 'test' | 'production';
  cutoverMode: DbCutoverMode;
  warnings: string[];
}

const INSECURE_SSL_MODES = new Set(['disable', 'allow']);
const STRONG_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * Redacts username/password and query-string tokens from any PostgreSQL URI so
 * credentials can never leak into console logs, audit records, or error traces.
 */
export function redactDatabaseUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl || !rawUrl.trim()) return '[UNCONFIGURED]';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.username) {
      parsed.username = `${parsed.username.slice(0, 2)}***`;
    }
    if (parsed.password) {
      parsed.password = '********';
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (lower.includes('password') || lower.includes('secret') || lower.includes('token') || lower.includes('key')) {
        parsed.searchParams.set(key, 'REDACTED');
      }
    }
    return parsed.toString();
  } catch {
    return '[INVALID_OR_REDACTED_DATABASE_URI]';
  }
}

export function resolveDbCutoverMode(env: NodeJS.ProcessEnv = process.env): DbCutoverMode {
  const raw = (env.DB_CUTOVER_MODE || '').trim().toUpperCase();
  if (raw === 'MAINTENANCE_READ_ONLY') return 'MAINTENANCE_READ_ONLY';
  return 'NEON_PRIMARY';
}

/**
 * Validates a Neon PostgreSQL connection string for protocol, TLS security, pooling, and credential hygiene.
 * Enforces `sslmode=verify-full` if omitted on remote/Neon hosts and rejects `sslmode=disable` or `sslmode=allow`.
 */
export function validateAndNormalizeNeonUrl(
  rawUrl: string | undefined,
  options?: {
    requirePooled?: boolean;
    allowLocalhostWithoutTlsForTests?: boolean;
    env?: NodeJS.ProcessEnv;
  }
): ValidatedNeonConnectionInfo {
  const env = options?.env || process.env;
  const nodeEnvRaw = (env.NODE_ENV || 'development').trim().toLowerCase();
  const environment: 'development' | 'test' | 'production' =
    nodeEnvRaw === 'production' ? 'production' : nodeEnvRaw === 'test' ? 'test' : 'development';
  const cutoverMode = resolveDbCutoverMode(env);
  const warnings: string[] = [];

  // Guard against accidental VITE_ frontend exposure in process environment
  if (env.VITE_DATABASE_URL?.trim() || env.VITE_NEON_DATABASE_URL?.trim()) {
    throw new Error(
      'SECURITY_BLOCK: VITE_DATABASE_URL / VITE_NEON_DATABASE_URL detected. Database credentials must NEVER use the VITE_ prefix.'
    );
  }

  const trimmed = (rawUrl || '')
    .trim()
    .replace(/^psql\s+/i, '')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  if (!trimmed) {
    return {
      configured: false,
      connectionString: '',
      redactedUrl: '[UNCONFIGURED]',
      host: '',
      database: '',
      isNeonHost: false,
      isPooledEndpoint: false,
      sslMode: 'unconfigured',
      environment,
      cutoverMode,
      warnings: ['DATABASE_URL is not set in backend environment secrets.'],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('INVALID_DATABASE_URL: DATABASE_URL must be a valid postgresql:// URI.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`INVALID_DATABASE_PROTOCOL: Expected postgresql://, got ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isNeonHost =
    host.endsWith('.neon.tech') ||
    host.includes('.aws.neon.tech') ||
    host.includes('.azure.neon.tech') ||
    host.includes('.gcp.neon.tech');
  const isPooledEndpoint = host.includes('-pooler.') || parsed.port === '6543';

  if (!parsed.password && !isLocalHost) {
    throw new Error('INSECURE_DATABASE_URL: Remote PostgreSQL connection requires strong password authentication.');
  }

  const requestedSslMode = (parsed.searchParams.get('sslmode') || '').trim().toLowerCase();

  if (INSECURE_SSL_MODES.has(requestedSslMode)) {
    if (!(isLocalHost && options?.allowLocalhostWithoutTlsForTests && environment !== 'production')) {
      throw new Error(
        `INSECURE_TLS_CONFIG: sslmode=${requestedSslMode} is strictly prohibited for Neon PostgreSQL connections. Use sslmode=verify-full.`
      );
    }
  }

  let effectiveSslMode = requestedSslMode;
  if (!isLocalHost) {
    if (!effectiveSslMode) {
      parsed.searchParams.set('sslmode', 'verify-full');
      effectiveSslMode = 'verify-full';
    } else if (!STRONG_SSL_MODES.has(effectiveSslMode)) {
      throw new Error(
        `UNSUPPORTED_SSL_MODE: sslmode=${effectiveSslMode} is not permitted. Use sslmode=verify-full or sslmode=require.`
      );
    }
    if (effectiveSslMode === 'require') {
      warnings.push(
        'sslmode=require encrypts traffic but sslmode=verify-full is recommended on Neon to prevent MITM certificate spoofing.'
      );
    }
  }

  if (isNeonHost && options?.requirePooled !== false && !isPooledEndpoint) {
    warnings.push(
      'DATABASE_URL uses a direct Neon compute hostname instead of the `-pooler` PgBouncer endpoint. Use the `-pooler` connection string for Express runtime queries and reserve DIRECT_DATABASE_URL for migrations.'
    );
  }

  if (isNeonHost && (env.NEON_PLAN_TIER || 'FREE').toUpperCase() === 'FREE') {
    warnings.push(
      'Neon Free Plan does not include IP Allowlisting or AWS PrivateLink (requires Neon Scale plan). Enforcing backend-only access, TLS certificate verification, least-privilege role, and distributed API rate limiting.'
    );
  }

  if (parsed.searchParams.has('channel_binding')) {
    parsed.searchParams.delete('channel_binding');
  }

  const database = parsed.pathname.replace(/^\//, '') || 'neondb';
  const normalizedString = parsed.toString();

  return {
    configured: true,
    connectionString: normalizedString,
    redactedUrl: redactDatabaseUrl(normalizedString),
    host,
    database,
    isNeonHost,
    isPooledEndpoint,
    sslMode: effectiveSslMode || (isLocalHost ? 'local' : 'verify-full'),
    environment,
    cutoverMode,
    warnings,
  };
}

/**
 * Builds hardened `pg.PoolConfig` for Express backend runtime queries against Neon's pooled endpoint.
 */
export function buildNeonPoolConfig(env: NodeJS.ProcessEnv = process.env): {
  info: ValidatedNeonConnectionInfo;
  poolConfig: PoolConfig | null;
} {
  const info = validateAndNormalizeNeonUrl(env.DATABASE_URL, {
    requirePooled: true,
    env,
  });

  if (!info.configured) {
    return { info, poolConfig: null };
  }

  const isLocalHost = info.host === 'localhost' || info.host === '127.0.0.1';
  const maxConnections = Math.min(25, Math.max(2, Number(env.DB_POOL_MAX || 10)));

  let runtimeConnectionString = info.connectionString;
  if (!isLocalHost) {
    try {
      const runtimeParsed = new URL(info.connectionString);
      runtimeParsed.searchParams.delete('sslmode');
      runtimeConnectionString = runtimeParsed.toString();
    } catch {
      runtimeConnectionString = info.connectionString;
    }
  }

  const poolConfig: PoolConfig = {
    connectionString: runtimeConnectionString,
    max: maxConnections,
    idleTimeoutMillis: 20_000, // Release idle clients cleanly before Neon 5-min autosuspend
    connectionTimeoutMillis: 12_000, // Accommodate Neon ~300-500ms scale-to-zero wake-up
    maxUses: 7_500,
    application_name: `bloodsearch-api-${info.environment}`,
    ssl: isLocalHost
      ? undefined
      : {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          servername: info.host,
        },
  };

  return { info, poolConfig };
}
