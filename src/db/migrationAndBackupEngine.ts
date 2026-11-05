import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { BloodSearchDatabase } from './index';
import { ALL_BLOODSEARCH_TABLES } from './schema';

export function computeCanonicalSha256(payload: unknown): string {
  const json = JSON.stringify(payload);
  return crypto.createHash('sha256').update(json).digest('hex');
}

// ============================================================================
// LOGICAL BACKUP & TAMPER-VERIFIED RESTORE ENGINE (All 28 Neon Tables)
// ============================================================================
export interface NeonLogicalBackupBundle {
  formatVersion: '2.0';
  createdAtIso: string;
  tableOrder: string[];
  tableCounts: Record<string, number>;
  tables: Record<string, Array<Record<string, unknown>>>;
  sha256Manifest: string;
}

export const ORDERED_BACKUP_TABLES = [
  'users',
  'auth_identities',
  'oidc_nonces',
  'login_sessions',
  'rate_limit_buckets',
  'hospitals',
  'blood_banks',
  'donor_profiles',
  'private_contacts',
  'blood_inventory',
  'blood_requests',
  'request_responses',
  'donations',
  'emergency_alerts',
  'notifications',
  'device_tokens',
  'admin_roles',
  'verification_records',
  'user_consents',
  'contact_requests',
  'live_donor_trips',
  'community_messages',
  'direct_chat_rooms',
  'direct_messages',
  'announcements',
  'reports',
  'gratitude_notes',
  'audit_logs',
] as const;

export async function exportNeonLogicalBackup(db: BloodSearchDatabase): Promise<NeonLogicalBackupBundle> {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const tableCounts: Record<string, number> = {};

  for (const tableName of ORDERED_BACKUP_TABLES) {
    const res = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
    const rows = ((res as unknown as { rows?: Array<Record<string, unknown>> }).rows || []).map((r) => ({ ...r }));
    tables[tableName] = rows;
    tableCounts[tableName] = rows.length;
  }

  const sha256Manifest = computeCanonicalSha256({ tableCounts, tables });

  return {
    formatVersion: '2.0',
    createdAtIso: new Date().toISOString(),
    tableOrder: [...ORDERED_BACKUP_TABLES],
    tableCounts,
    tables,
    sha256Manifest,
  };
}

/**
 * Verifies cryptographic SHA-256 integrity of a backup bundle and restores all 28 Neon tables
 * in parent-before-child foreign-key order inside an atomic PostgreSQL transaction.
 */
export async function restoreAndVerifyNeonBackup(
  db: BloodSearchDatabase,
  bundle: NeonLogicalBackupBundle
): Promise<{ restoredTables: number; totalRowsRestored: number; verifiedCountsMatch: boolean }> {
  const expectedHash = computeCanonicalSha256({
    tableCounts: bundle.tableCounts,
    tables: bundle.tables,
  });

  if (expectedHash !== bundle.sha256Manifest) {
    throw new Error('BACKUP_INTEGRITY_FAILED: SHA-256 manifest mismatch. Backup file may be corrupted or tampered with.');
  }

  const allowedTables = new Set<string>(ALL_BLOODSEARCH_TABLES);
  for (const tbl of Object.keys(bundle.tables)) {
    if (!allowedTables.has(tbl)) {
      throw new Error(`UNTRUSTED_BACKUP_TABLE: Refusing to restore unrecognized table "${tbl}".`);
    }
  }

  let totalRowsRestored = 0;

  await db.transaction(async (tx) => {
    const reverseOrder = [...ORDERED_BACKUP_TABLES].reverse();
    for (const tbl of reverseOrder) {
      await tx.execute(sql.raw(`DELETE FROM "${tbl}"`));
    }

    for (const tbl of ORDERED_BACKUP_TABLES) {
      const rows = bundle.tables[tbl] || [];
      for (const row of rows) {
        const cols = Object.keys(row).filter((k) => /^[a-z0-9_]+$/.test(k));
        if (cols.length === 0) continue;

        const colIdentifiers = sql.raw(cols.map((c) => `"${c}"`).join(', '));
        const valFragments = cols.map((c) => {
          const val = row[c];
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            return sql`${JSON.stringify(val)}::jsonb`;
          }
          return sql`${val as any}`;
        });

        await tx.execute(
          sql`INSERT INTO ${sql.raw(`"${tbl}"`)} (${colIdentifiers}) VALUES (${sql.join(valFragments, sql`, `)})`
        );
        totalRowsRestored += 1;
      }
    }

    await tx.execute(
      sql.raw(`SELECT setval(pg_get_serial_sequence('audit_logs', 'id'), COALESCE((SELECT MAX(id) FROM audit_logs), 1), true)`)
    );
  });

  let verifiedCountsMatch = true;
  for (const tbl of ORDERED_BACKUP_TABLES) {
    const checkRes = await db.execute(sql.raw(`SELECT COUNT(*)::int AS cnt FROM "${tbl}"`));
    const actualCnt = Number(
      ((checkRes as unknown as { rows?: Array<{ cnt?: number }> }).rows || [])[0]?.cnt ?? 0
    );
    if (actualCnt !== (bundle.tableCounts[tbl] ?? 0)) {
      verifiedCountsMatch = false;
    }
  }

  return {
    restoredTables: ORDERED_BACKUP_TABLES.length,
    totalRowsRestored,
    verifiedCountsMatch,
  };
}
