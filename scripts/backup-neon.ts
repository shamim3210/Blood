import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { closeNeonDatabase, getNeonDatabase } from '../src/db/index';
import { exportNeonLogicalBackup } from '../src/db/migrationAndBackupEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  const { db, info } = getNeonDatabase();
  if (!db) {
    console.error('✗ DATABASE_URL is not configured in server environment.');
    process.exit(1);
  }

  console.log(`→ Exporting logical backup of all Neon PostgreSQL tables from ${info.redactedUrl}...`);
  const bundle = await exportNeonLogicalBackup(db);

  const outDir = path.join(ROOT_DIR, 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stampedPath = path.join(outDir, `neon-backup-${Date.now()}.json`);
  const latestPath = path.join(outDir, 'neon-backup-latest.json');

  fs.writeFileSync(stampedPath, JSON.stringify(bundle, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(bundle, null, 2), 'utf8');

  console.log(`✓ Neon PostgreSQL logical backup saved: ${stampedPath}`);
  console.log(`  SHA-256 Manifest: ${bundle.sha256Manifest}`);
  await closeNeonDatabase();
}

main().catch(async (err) => {
  console.error('✗ Neon backup failed:', err instanceof Error ? err.message : err);
  await closeNeonDatabase();
  process.exit(1);
});
