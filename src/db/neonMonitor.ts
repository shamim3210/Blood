import { sql } from 'drizzle-orm';
import type { BloodSearchDatabase } from './index';
import type { ValidatedNeonConnectionInfo } from './neonConfig';

/**
 * Verified Official Neon Free Plan Limits (Verified against neon.com documentation):
 *  - Storage Limit: 1 GB (1,073,741,824 bytes) per project
 *  - Monthly Compute Budget: 100 CU-hours / month (autoscales up to 2 CU / 8 GB RAM)
 *  - Autosuspend (Scale-to-Zero): Mandatory after 5 minutes idle (~300–500ms cold start)
 *  - Branches: Up to 10 branches per project
 *  - Point-in-Time Restore (PITR) Window: 6 hours history + 1 manual snapshot
 *  - Network Restrictions: IP Allowlist & AWS PrivateLink require Neon Scale Plan (unavailable on Free Plan)
 */
export const NEON_FREE_PLAN_LIMITS = {
  maxStorageBytes: 1024 * 1024 * 1024, // 1.0 GiB (1,073,741,824 bytes)
  warnStorageRatio: 0.75, // Warn at 75% (768 MiB)
  criticalStorageRatio: 0.9, // Critical alert at 90% (921.6 MiB)
  monthlyComputeCuHours: 100,
  maxAutoscaleCu: 2,
  autosuspendIdleSeconds: 300, // 5 minutes mandatory on Free Plan
  maxBranches: 10,
  pitrHistoryHours: 6,
  ipAllowlistAvailableOnFreePlan: false,
} as const;

export interface NeonHealthAndPlanReport {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNCONFIGURED' | 'OFFLINE';
  checkedAtIso: string;
  cutoverMode: string;
  connection: {
    configured: boolean;
    host: string;
    database: string;
    isNeonHost: boolean;
    isPooledEndpoint: boolean;
    sslMode: string;
    latencyMs: number | null;
    coldStartLikely: boolean;
  };
  capabilities: {
    postgresVersion: string | null;
    postgisInstalled: boolean;
    postgisVersion: string | null;
    activeGeoStrategy: 'POSTGIS_GEOGRAPHY' | 'INDEXED_BOUNDING_BOX_HAVERSINE';
  };
  storage: {
    usedBytes: number;
    usedMb: number;
    freePlanLimitMb: number;
    utilizationPercent: number;
    thresholdState: 'OK' | 'WARNING_75_PERCENT' | 'CRITICAL_90_PERCENT';
  };
  connections: {
    activeBackends: number;
  };
  freePlanAdvisories: string[];
}

let cachedPostgisSupport: { checkedAtMs: number; installed: boolean; version: string | null } | null = null;

/**
 * Dynamically inspects `pg_extension` to verify whether PostGIS is genuinely installed
 * on the connected PostgreSQL / Neon database. Cached for 5 minutes.
 */
export async function checkPostgisAvailability(
  db: BloodSearchDatabase,
  forceRefresh = false
): Promise<{ installed: boolean; version: string | null }> {
  const now = Date.now();
  if (!forceRefresh && cachedPostgisSupport && now - cachedPostgisSupport.checkedAtMs < 5 * 60 * 1000) {
    return {
      installed: cachedPostgisSupport.installed,
      version: cachedPostgisSupport.version,
    };
  }

  try {
    const extRes = await db.execute(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'postgis' LIMIT 1`
    );
    const rows = (extRes as unknown as { rows?: Array<{ extversion?: string }> }).rows || [];
    const installed = rows.length > 0;
    const version = installed ? String(rows[0]?.extversion || 'enabled') : null;
    cachedPostgisSupport = { checkedAtMs: now, installed, version };
    return { installed, version };
  } catch {
    cachedPostgisSupport = { checkedAtMs: now, installed: false, version: null };
    return { installed: false, version: null };
  }
}

export function resetPostgisCacheForTesting(): void {
  cachedPostgisSupport = null;
}

/**
 * Executes a non-destructive diagnostic check against PostgreSQL / Neon and evaluates
 * resource utilization against Neon Free Plan limits (storage %, cold-start latency,
 * connection pooling, PostGIS status, PITR 6h backup window, and network restrictions).
 */
export async function evaluateNeonHealthAndLimits(
  db: BloodSearchDatabase | null,
  info: ValidatedNeonConnectionInfo
): Promise<NeonHealthAndPlanReport> {
  const advisories = [...info.warnings];

  if (!db || !info.configured) {
    return {
      status: 'UNCONFIGURED',
      checkedAtIso: new Date().toISOString(),
      cutoverMode: info.cutoverMode,
      connection: {
        configured: false,
        host: info.host,
        database: info.database,
        isNeonHost: info.isNeonHost,
        isPooledEndpoint: info.isPooledEndpoint,
        sslMode: info.sslMode,
        latencyMs: null,
        coldStartLikely: false,
      },
      capabilities: {
        postgresVersion: null,
        postgisInstalled: false,
        postgisVersion: null,
        activeGeoStrategy: 'INDEXED_BOUNDING_BOX_HAVERSINE',
      },
      storage: {
        usedBytes: 0,
        usedMb: 0,
        freePlanLimitMb: 1024,
        utilizationPercent: 0,
        thresholdState: 'OK',
      },
      connections: {
        activeBackends: 0,
      },
      freePlanAdvisories: [
        ...advisories,
        'Configure DATABASE_URL (pooled -pooler Neon URI) and DIRECT_DATABASE_URL in server secrets for external Neon PostgreSQL persistence.',
      ],
    };
  }

  const startedAt = Date.now();
  try {
    const diagRes = await db.execute(sql`
      SELECT
        pg_database_size(current_database())::bigint AS db_size_bytes,
        current_setting('server_version') AS pg_version,
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS active_backends
    `);
    const latencyMs = Date.now() - startedAt;
    const rows = (
      diagRes as unknown as {
        rows?: Array<{ db_size_bytes?: string | number; pg_version?: string; active_backends?: number }>;
      }
    ).rows || [];
    const row = rows[0] || {};

    const usedBytes = Number(row.db_size_bytes || 0);
    const usedMb = Number((usedBytes / (1024 * 1024)).toFixed(2));
    const ratio = usedBytes / NEON_FREE_PLAN_LIMITS.maxStorageBytes;
    const utilizationPercent = Number((ratio * 100).toFixed(2));

    let thresholdState: 'OK' | 'WARNING_75_PERCENT' | 'CRITICAL_90_PERCENT' = 'OK';
    if (ratio >= NEON_FREE_PLAN_LIMITS.criticalStorageRatio) {
      thresholdState = 'CRITICAL_90_PERCENT';
      advisories.push(
        `CRITICAL STORAGE ALERT: Database size (${usedMb} MB) has exceeded 90% of the 1,024 MB Neon Free Plan storage limit. Upgrade to Neon Launch/Scale immediately to prevent read-only lockouts during emergency blood requests.`
      );
    } else if (ratio >= NEON_FREE_PLAN_LIMITS.warnStorageRatio) {
      thresholdState = 'WARNING_75_PERCENT';
      advisories.push(
        `STORAGE WARNING: Database size (${usedMb} MB) has exceeded 75% of the 1,024 MB Neon Free Plan storage limit. Plan an upgrade or archive old logs.`
      );
    }

    const coldStartLikely = latencyMs > 320;
    if (coldStartLikely) {
      advisories.push(
        `Compute wake-up latency was ${latencyMs}ms (>320ms). Neon Free Plan enforces 5-minute scale-to-zero autosuspend and 100 CU-hours/month. Upgrade to Neon Launch/Scale with autosuspend disabled for zero-cold-start 24/7 emergency traffic.`
      );
    }

    advisories.push(
      'Neon Free Plan retains only 6 hours of Point-in-Time Restore (PITR) history. Run scheduled external logical backups (`npm run db:backup`) at least every 4 hours for production disaster recovery.'
    );

    const postgis = await checkPostgisAvailability(db);
    const activeBackends = Number(row.active_backends || 1);

    const overallStatus: NeonHealthAndPlanReport['status'] =
      thresholdState === 'CRITICAL_90_PERCENT'
        ? 'CRITICAL'
        : thresholdState === 'WARNING_75_PERCENT' || advisories.some((a) => a.includes('direct Neon compute'))
          ? 'WARNING'
          : 'HEALTHY';

    return {
      status: overallStatus,
      checkedAtIso: new Date().toISOString(),
      cutoverMode: info.cutoverMode,
      connection: {
        configured: true,
        host: info.host,
        database: info.database,
        isNeonHost: info.isNeonHost,
        isPooledEndpoint: info.isPooledEndpoint,
        sslMode: info.sslMode,
        latencyMs,
        coldStartLikely,
      },
      capabilities: {
        postgresVersion: row.pg_version || null,
        postgisInstalled: postgis.installed,
        postgisVersion: postgis.version,
        activeGeoStrategy: postgis.installed ? 'POSTGIS_GEOGRAPHY' : 'INDEXED_BOUNDING_BOX_HAVERSINE',
      },
      storage: {
        usedBytes,
        usedMb,
        freePlanLimitMb: 1024,
        utilizationPercent,
        thresholdState,
      },
      connections: {
        activeBackends,
      },
      freePlanAdvisories: advisories,
    };
  } catch (err) {
    return {
      status: 'OFFLINE',
      checkedAtIso: new Date().toISOString(),
      cutoverMode: info.cutoverMode,
      connection: {
        configured: info.configured,
        host: info.host,
        database: info.database,
        isNeonHost: info.isNeonHost,
        isPooledEndpoint: info.isPooledEndpoint,
        sslMode: info.sslMode,
        latencyMs: Date.now() - startedAt,
        coldStartLikely: false,
      },
      capabilities: {
        postgresVersion: null,
        postgisInstalled: false,
        postgisVersion: null,
        activeGeoStrategy: 'INDEXED_BOUNDING_BOX_HAVERSINE',
      },
      storage: {
        usedBytes: 0,
        usedMb: 0,
        freePlanLimitMb: 1024,
        utilizationPercent: 0,
        thresholdState: 'OK',
      },
      connections: {
        activeBackends: 0,
      },
      freePlanAdvisories: [
        ...advisories,
        `Database connectivity check failed (${err instanceof Error ? err.name : 'Error'}). Verify Neon compute status and TLS credentials.`,
      ],
    };
  }
}
