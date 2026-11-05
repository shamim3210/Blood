import type { Response } from 'express';
import { lt, sql } from 'drizzle-orm';
import type { BloodSearchDatabase } from '../db/index';
import { rateLimitBuckets } from '../db/schema';

const MAX_FALLBACK_BUCKETS = 4000;
const fallbackBuckets = new Map<string, { hits: number[]; blockedUntilMs: number }>();
let lastPruneMs = 0;

function checkLocalFallbackBucket(
  bucketKey: string,
  maxRequests: number,
  windowMs: number,
  blockDurationMs?: number
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  const entry = fallbackBuckets.get(bucketKey) || { hits: [], blockedUntilMs: 0 };

  if (entry.blockedUntilMs > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.blockedUntilMs - now) / 1000)),
      remaining: 0,
    };
  }

  const activeHits = entry.hits.filter((ts) => now - ts < windowMs);
  if (activeHits.length >= maxRequests) {
    const blockedUntilMs = blockDurationMs ? now + blockDurationMs : (activeHits[0] || now) + windowMs;
    entry.hits = activeHits;
    entry.blockedUntilMs = blockedUntilMs;
    fallbackBuckets.set(bucketKey, entry);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000)),
      remaining: 0,
    };
  }

  if (!fallbackBuckets.has(bucketKey) && fallbackBuckets.size >= MAX_FALLBACK_BUCKETS) {
    const oldest = fallbackBuckets.keys().next().value;
    if (oldest !== undefined) fallbackBuckets.delete(oldest);
  }

  activeHits.push(now);
  entry.hits = activeHits;
  fallbackBuckets.set(bucketKey, entry);

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, maxRequests - activeHits.length),
  };
}

/**
 * Distributed multi-instance atomic rate limiter backed by Neon PostgreSQL (`rate_limit_buckets`).
 * Safe across horizontal Cloud Run / Vercel serverless instances while falling back cleanly
 * to bounded in-memory sliding windows if `db` is temporarily unavailable.
 */
export async function checkDistributedRateLimit(
  db: BloodSearchDatabase | null,
  bucketKey: string,
  maxRequests: number,
  windowMs: number,
  blockDurationMs?: number
): Promise<{ allowed: boolean; retryAfterSec: number; remaining: number }> {
  const safeKey = String(bucketKey || 'default').slice(0, 175);
  if (!db) {
    return checkLocalFallbackBucket(safeKey, maxRequests, windowMs, blockDurationMs);
  }

  const now = new Date();
  const nowMs = now.getTime();
  const nextExpiry = new Date(nowMs + windowMs);

  // Opportunistically prune expired buckets at most once every 2 minutes
  if (nowMs - lastPruneMs > 120_000) {
    lastPruneMs = nowMs;
    db.delete(rateLimitBuckets)
      .where(lt(rateLimitBuckets.expiresAt, now))
      .catch(() => {});
  }

  try {
    const upserted = await db.execute(sql`
      INSERT INTO "rate_limit_buckets" ("bucket_key", "hit_count", "window_start", "expires_at", "blocked_until")
      VALUES (${safeKey}, 1, ${now}, ${nextExpiry}, NULL)
      ON CONFLICT ("bucket_key") DO UPDATE
      SET
        "hit_count" = CASE
          WHEN "rate_limit_buckets"."expires_at" <= ${now}
            AND ("rate_limit_buckets"."blocked_until" IS NULL OR "rate_limit_buckets"."blocked_until" <= ${now})
            THEN 1
          ELSE "rate_limit_buckets"."hit_count" + 1
        END,
        "window_start" = CASE
          WHEN "rate_limit_buckets"."expires_at" <= ${now}
            AND ("rate_limit_buckets"."blocked_until" IS NULL OR "rate_limit_buckets"."blocked_until" <= ${now})
            THEN ${now}
          ELSE "rate_limit_buckets"."window_start"
        END,
        "expires_at" = CASE
          WHEN "rate_limit_buckets"."expires_at" <= ${now}
            AND ("rate_limit_buckets"."blocked_until" IS NULL OR "rate_limit_buckets"."blocked_until" <= ${now})
            THEN ${nextExpiry}
          ELSE "rate_limit_buckets"."expires_at"
        END,
        "blocked_until" = CASE
          WHEN "rate_limit_buckets"."blocked_until" IS NOT NULL AND "rate_limit_buckets"."blocked_until" > ${now}
            THEN "rate_limit_buckets"."blocked_until"
          WHEN (
            CASE
              WHEN "rate_limit_buckets"."expires_at" <= ${now} THEN 1
              ELSE "rate_limit_buckets"."hit_count" + 1
            END
          ) > ${maxRequests} AND ${blockDurationMs ?? 0} > 0
            THEN ${new Date(nowMs + (blockDurationMs || windowMs))}
          ELSE NULL
        END
      RETURNING "hit_count", "expires_at", "blocked_until"
    `);

    const rows = (
      upserted as unknown as {
        rows?: Array<{
          hit_count?: number;
          expires_at?: string | Date;
          blocked_until?: string | Date | null;
        }>;
      }
    ).rows;
    const row = rows?.[0];
    if (!row) {
      return checkLocalFallbackBucket(safeKey, maxRequests, windowMs, blockDurationMs);
    }

    const hitCount = Number(row.hit_count || 1);
    const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : nowMs + windowMs;
    const blockedUntilMs = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;

    if (blockedUntilMs > nowMs) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000)),
        remaining: 0,
      };
    }

    if (hitCount > maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000)),
        remaining: 0,
      };
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, maxRequests - hitCount),
    };
  } catch {
    return checkLocalFallbackBucket(safeKey, maxRequests, windowMs, blockDurationMs);
  }
}

export async function enforceDistributedRateLimit(
  res: Response,
  db: BloodSearchDatabase | null,
  bucketKey: string,
  maxRequests: number,
  windowMs: number,
  options?: { blockDurationMs?: number; code?: string; message?: string }
): Promise<boolean> {
  const verdict = await checkDistributedRateLimit(
    db,
    bucketKey,
    maxRequests,
    windowMs,
    options?.blockDurationMs
  );
  res.setHeader('X-RateLimit-Limit', String(maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));

  if (!verdict.allowed) {
    res.setHeader('Retry-After', String(verdict.retryAfterSec));
    res.status(429).json({
      ok: false,
      code: options?.code || 'RATE_LIMITED',
      message: options?.message || 'Too many requests. Please wait before retrying.',
      retryAfterSec: verdict.retryAfterSec,
    });
    return false;
  }
  return true;
}

export function resetFallbackRateLimitsForTesting(): void {
  fallbackBuckets.clear();
}
