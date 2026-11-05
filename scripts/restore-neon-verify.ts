import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { closeNeonDatabase, getNeonDatabase } from '../src/db/index';
import {
  restoreAndVerifyNeonBackup,
  type NeonLogicalBackupBundle,
} from '../src/db/migrationAndBackupEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  if (process.env.ALLOW_DESTRUCTIVE_RESTORE !== 'true') {
    console.error(
      '✗ Safety lock active: set ALLOW_DESTRUCTIVE_RESTORE="true" targeting an isolated Neon restore branch before running restore.'
    );
    process.exit(1);
  }

  const backupPath =
    process.argv[2] || path.join(ROOT_DIR, 'backups', 'neon-backup-latest.json');

  if (!fs.existsSync(backupPath)) {
    console.error(`✗ Backup bundle not found at ${backupPath}.`);
    process.exit(1);
  }

  const bundle = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as NeonLogicalBackupBundle;
  const { db, info } = getNeonDatabase();
  if (!db) {
    console.error('✗ DATABASE_URL is not configured.');
    process.exit(1);
  }

  console.log(`→ Verifying SHA-256 manifest & restoring all tables into ${info.redactedUrl}...`);
  const result = await restoreAndVerifyNeonBackup(db, bundle);
  console.log(`✓ Restored ${result.restoredTables} tables (${result.totalRowsRestored} rows).`);
  console.log(`  Row count parity verified: ${result.verifiedCountsMatch}`);

  await closeNeonDatabase();
  if (!result.verifiedCountsMatch) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('✗ Restore verification failed:', err instanceof Error ? err.message : err);
  await closeNeonDatabase();
  process.exit(1);
});
