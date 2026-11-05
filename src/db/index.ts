import fs from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { CORE_BOOTSTRAP_SQL, CORE_BOOTSTRAP_STATEMENTS } from './bootstrapSql';
import { buildNeonPoolConfig, redactDatabaseUrl, type ValidatedNeonConnectionInfo } from './neonConfig';
import * as schema from './schema';

if (typeof window !== 'undefined' || typeof document !== 'undefined') {
  throw new Error(
    'FATAL_SECURITY_VIOLATION: Database driver (src/db/index.ts) must never be imported in frontend code.'
  );
}

const ROOT_DIR = process.cwd();
const EMBEDDED_PG_DIR = path.join(ROOT_DIR, '.data', 'bloodsearch-main-pg');

export type BloodSearchDatabase = NodePgDatabase<typeof schema>;

let singletonPool: pg.Pool | null = null;
let singletonEmbeddedClient: PGlite | null = null;
let singletonDb: BloodSearchDatabase | null = null;
let singletonInfo: ValidatedNeonConnectionInfo | null = null;
let embeddedInitPromise: Promise<BloodSearchDatabase | null> | null = null;
let neonBootstrapPromise: Promise<boolean> | null = null;
let neonConnectionHealthy = false;
let overrideDbForTesting: BloodSearchDatabase | null = null;

/**
 * Injects an isolated PostgreSQL instance (e.g., PGlite Postgres 16 in integration tests)
 * so routes and repositories execute against real PostgreSQL SQL without mocking queries.
 */
export function setDatabaseOverrideForTesting(db: BloodSearchDatabase | null): void {
  overrideDbForTesting = db;
}

function isServerlessEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VERCEL ||
      env.VERCEL_ENV ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      env.BLOODSEARCH_SERVERLESS_MODE === 'true'
  );
}

async function ensureNeonPoolSchemaReady(pool: pg.Pool, info: ValidatedNeonConnectionInfo): Promise<boolean> {
  if (neonConnectionHealthy) return true;
  if (!neonBootstrapPromise) {
    neonBootstrapPromise = (async () => {
      try {
        const checkRes = await pool.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('users', 'auth_identities', 'login_sessions', 'donor_profiles', 'contact_requests', 'direct_messages', 'reports')`
        );
        if (Number(checkRes.rows[0]?.cnt) < 7) {
          const client = await pool.connect();
          try {
            for (const stmt of CORE_BOOTSTRAP_STATEMENTS) {
              await client.query(stmt);
            }
          } finally {
            client.release();
          }
        }
        neonConnectionHealthy = true;
        return true;
      } catch (err) {
        neonBootstrapPromise = null;
        const safeMsg = err instanceof Error ? redactDatabaseUrl(err.message) : 'Unknown Neon init error';
        console.error(`[MainPostgres] Neon schema/connection verification failed (${info.redactedUrl}): ${safeMsg}`);
        return false;
      }
    })();
  }
  return neonBootstrapPromise;
}

/**
 * Ensures the server-side Neon PostgreSQL database is ready for `/api/v1/*` requests:
 *  - Primary: External Neon PostgreSQL over TLS (`DATABASE_URL`), with idempotent 28-table bootstrap.
 *  - Local Dev / CI Server Fallback (non-serverless Node hosts when `DATABASE_URL` is unset):
 *    Persistent server-isolated PostgreSQL 16 (`PGlite` at `.data/bloodsearch-main-pg`).
 *  - Serverless Fallback (when `DATABASE_URL` is unset): Cleanly returns `db: null` without WASM crashes.
 */
export async function ensureMainPostgresReady(
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  db: BloodSearchDatabase | null;
  pool: pg.Pool | null;
  info: ValidatedNeonConnectionInfo;
}> {
  if (overrideDbForTesting) {
    return getNeonDatabase(env);
  }

  let current: {
    db: BloodSearchDatabase | null;
    pool: pg.Pool | null;
    info: ValidatedNeonConnectionInfo;
  };

  try {
    current = getNeonDatabase(env);
  } catch (err) {
    if (env !== process.env) {
      throw err;
    }
    const safeMsg = err instanceof Error ? redactDatabaseUrl(err.message) : 'Invalid DATABASE_URL';
    console.error(`[MainPostgres] DATABASE_URL configuration warning: ${safeMsg}`);
    current = {
      db: null,
      pool: null,
      info: {
        configured: false,
        connectionString: '',
        redactedUrl: '[INVALID_OR_REDACTED_DATABASE_URI]',
        host: '',
        database: '',
        isNeonHost: false,
        isPooledEndpoint: false,
        sslMode: 'unconfigured',
        environment: env.NODE_ENV === 'production' ? 'production' : 'development',
        cutoverMode: 'NEON_PRIMARY',
        warnings: [safeMsg],
      },
    };
  }

  if (current.db && current.pool) {
    const ready = await ensureNeonPoolSchemaReady(current.pool, current.info);
    if (ready) {
      return current;
    }
    if (isServerlessEnvironment(env)) {
      return {
        db: null,
        pool: null,
        info: {
          ...current.info,
          configured: false,
          warnings: [...current.info.warnings, 'Neon PostgreSQL endpoint was unreachable during cold start.'],
        },
      };
    }
  } else if (current.db) {
    return current;
  }

  if (
    process.env.BLOODSEARCH_SERVERLESS_MODE === 'true' ||
    env !== process.env ||
    env.BLOODSEARCH_DISABLE_EMBEDDED_PG === 'true' ||
    isServerlessEnvironment(env)
  ) {
    return current;
  }

  if (!embeddedInitPromise) {
    embeddedInitPromise = (async () => {
      try {
        const pglitePkg = ['@electric-sql', 'pglite'].join('/');
        const drizzlePglitePkg = ['drizzle-orm', 'pglite'].join('/');
        const [{ PGlite: PGliteRuntime }, { drizzle: drizzlePgliteRuntime }] = await Promise.all([
          import(pglitePkg),
          import(drizzlePglitePkg),
        ]);
        let client: PGlite;
        try {
          fs.mkdirSync(EMBEDDED_PG_DIR, { recursive: true, mode: 0o700 });
          client = new PGliteRuntime(EMBEDDED_PG_DIR);
          await client.waitReady;
        } catch {
          // If directory is locked or has corrupted WASM state, cleanly fall back to in-memory PostgreSQL 16
          try {
            fs.rmSync(EMBEDDED_PG_DIR, { recursive: true, force: true });
          } catch {}
          client = new PGliteRuntime();
          await client.waitReady;
        }

        const checkRes = await client.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('users', 'auth_identities', 'login_sessions', 'donor_profiles', 'contact_requests', 'direct_messages', 'reports')`
        );
        if (Number(checkRes.rows[0]?.cnt) < 7) {
          await client.exec(CORE_BOOTSTRAP_SQL);
        }

        singletonEmbeddedClient = client;
        singletonDb = drizzlePgliteRuntime(client, { schema }) as unknown as BloodSearchDatabase;
        singletonInfo = {
          ...current.info,
          configured: true,
          host: 'server-isolated-postgres16',
          database: 'bloodsearch_main',
          sslMode: 'server-local-isolated',
          isPooledEndpoint: true,
          cutoverMode: 'NEON_PRIMARY',
          redactedUrl: 'postgres://[SERVER_ISOLATED_PG16]/bloodsearch_main',
        };
        return singletonDb;
      } catch (err) {
        embeddedInitPromise = null;
        const msg = err instanceof Error ? redactDatabaseUrl(err.message) : 'Embedded PG init error';
        console.error(`[MainPostgres] Embedded PostgreSQL fallback error: ${msg}`);
        return null;
      }
    })();
  }

  const fallbackDb = await embeddedInitPromise;
  return {
    db: fallbackDb,
    pool: null,
    info: fallbackDb && singletonInfo ? singletonInfo : current.info,
  };
}

/**
 * Lazily initializes and returns the singleton Neon PostgreSQL Drizzle instance.
 * Never opens eager background connections at import time and never logs raw credentials.
 */
export function getNeonDatabase(env: NodeJS.ProcessEnv = process.env): {
  db: BloodSearchDatabase | null;
  pool: pg.Pool | null;
  info: ValidatedNeonConnectionInfo;
} {
  if (overrideDbForTesting) {
    const { info } = buildNeonPoolConfig(env);
    return {
      db: overrideDbForTesting,
      pool: null,
      info: {
        ...info,
        configured: true,
        host: 'pglite-embedded-postgres16',
        database: 'bloodsearch_test',
        sslMode: 'local-memory',
        cutoverMode: 'NEON_PRIMARY',
      },
    };
  }

  if (env !== process.env) {
    const { info, poolConfig } = buildNeonPoolConfig(env);
    if (!poolConfig) {
      return { db: null, pool: null, info };
    }
  }

  if (singletonDb && singletonInfo) {
    return { db: singletonDb, pool: singletonPool, info: singletonInfo };
  }

  const { info, poolConfig } = buildNeonPoolConfig(env);
  if (!poolConfig) {
    return { db: null, pool: null, info };
  }

  singletonInfo = info;
  const pool = new pg.Pool(poolConfig);
  pool.on('error', (err) => {
    const safeMsg = err?.message ? redactDatabaseUrl(err.message) : 'Unknown pool error';
    console.error(`[NeonPool] Idle client error (${info.redactedUrl}): ${safeMsg}`);
  });

  singletonPool = pool;
  singletonDb = drizzle(pool, { schema });

  return { db: singletonDb, pool: singletonPool, info };
}

export async function closeNeonDatabase(): Promise<void> {
  if (singletonPool) {
    await singletonPool.end();
    singletonPool = null;
  }
  if (singletonEmbeddedClient) {
    await singletonEmbeddedClient.close();
    singletonEmbeddedClient = null;
  }
  singletonDb = null;
  singletonInfo = null;
  embeddedInitPromise = null;
  neonBootstrapPromise = null;
  neonConnectionHealthy = false;
}

export { schema };
