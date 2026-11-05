import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { createEmergencyApiApp } from '../server';
import {
  setDatabaseOverrideForTesting,
  type BloodSearchDatabase,
} from '../src/db/index';
import {
  exportNeonLogicalBackup,
  restoreAndVerifyNeonBackup,
} from '../src/db/migrationAndBackupEngine';
import { redactDatabaseUrl, validateAndNormalizeNeonUrl } from '../src/db/neonConfig';
import { evaluateNeonHealthAndLimits, resetPostgisCacheForTesting } from '../src/db/neonMonitor';
import type { AuthenticatedActor } from '../src/db/repositories/bloodSearchRepo';
import {
  ALL_BLOODSEARCH_TABLES,
  auditLogs,
  CORE_REQUIRED_TABLES,
  donations,
  donorProfiles,
  emergencyAlerts,
} from '../src/db/schema';
import * as fullSchema from '../src/db/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function findCoreMigrationSql(): string {
  const drizzleDir = path.join(ROOT_DIR, 'drizzle');
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql') && f.startsWith('0000_') && !f.startsWith('rollback_'))
    .sort();
  assert.ok(files.length > 0, 'Expected generated 0000_*.sql Drizzle migration in /drizzle');
  return fs.readFileSync(path.join(drizzleDir, files[0]!), 'utf8');
}

const TEST_ACTORS: Record<string, AuthenticatedActor> = {
  'token-super-admin': {
    uid: 'uid_super_owner_01',
    email: 'shamimrakib015@gmail.com',
    emailVerified: true,
    ipHash: 'ip_super',
  },
  'token-spoof-unverified-super': {
    uid: 'uid_spoof_99',
    email: 'shamimrakib015@gmail.com',
    emailVerified: false,
    ipHash: 'ip_spoof',
  },
  'token-coadmin': {
    uid: 'uid_coadmin_01',
    email: 'coadmin@bloodsearch.org',
    emailVerified: true,
    ipHash: 'ip_coadmin',
  },
  'token-donor-dhanmondi': {
    uid: 'uid_donor_dhanmondi',
    email: 'dhanmondi.donor@example.com',
    emailVerified: true,
    ipHash: 'ip_d1',
  },
  'token-donor-gulshan': {
    uid: 'uid_donor_gulshan',
    email: 'gulshan.donor@example.com',
    emailVerified: true,
    ipHash: 'ip_d2',
  },
  'token-donor-ctg-dnd': {
    uid: 'uid_donor_ctg_dnd',
    email: 'ctg.donor@example.com',
    emailVerified: true,
    ipHash: 'ip_d3',
  },
  'token-seeker-rahim': {
    uid: 'uid_seeker_rahim',
    email: 'rahim.seeker@example.com',
    emailVerified: true,
    ipHash: 'ip_seeker',
  },
  'token-attacker-mallory': {
    uid: 'uid_attacker_mallory',
    email: 'mallory@example.com',
    emailVerified: true,
    ipHash: 'ip_mallory',
  },
};

describe('BloodSearch Neon PostgreSQL Architecture, Security, Migration & Backup Suite', () => {
  let pgClient: PGlite;
  let db: BloodSearchDatabase;
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    resetPostgisCacheForTesting();
    pgClient = new PGlite();
    const ddlSql = findCoreMigrationSql();
    // Apply exact Drizzle-generated PostgreSQL DDL statements
    await pgClient.exec(ddlSql.replace(/--> statement-breakpoint/g, '\n'));

    db = drizzlePglite(pgClient, { schema: fullSchema }) as unknown as BloodSearchDatabase;
    setDatabaseOverrideForTesting(db);

    const app = createEmergencyApiApp({
      verifyNeonActorOverride: async (token: string) => TEST_ACTORS[token] || null,
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    setDatabaseOverrideForTesting(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pgClient.close();
  });

  async function apiJson(
    method: string,
    route: string,
    opts?: { token?: string; body?: unknown }
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {};
    if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts?.body !== undefined) headers['Content-Type'] = 'application/json';

    const resp = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    return { status: resp.status, json };
  }

  it('1. Verifies all 21 core tables + 7 parity tables (28 total) and PostgreSQL CHECK/FK constraints', async () => {
    assert.equal(CORE_REQUIRED_TABLES.length, 21);
    assert.equal(ALL_BLOODSEARCH_TABLES.length, 28);

    const tblRes = await pgClient.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existing = new Set(tblRes.rows.map((r) => r.table_name));
    for (const requiredTable of ALL_BLOODSEARCH_TABLES) {
      assert.ok(existing.has(requiredTable), `Missing required PostgreSQL table: ${requiredTable}`);
    }

    // Verify PostgreSQL CHECK constraint blocks invalid blood_group at DB level
    await assert.rejects(
      async () => {
        await pgClient.query(
          `INSERT INTO users (uid, display_name, blood_group) VALUES ('bad_bg_u1', 'Bad BG', 'Z+')`
        );
      },
      /chk_users_blood_group/i
    );

    // Verify PostgreSQL FK constraint blocks orphan donor_profile without parent user
    await assert.rejects(
      async () => {
        await pgClient.query(
          `INSERT INTO donor_profiles (user_uid, donor_smart_id, public_name, blood_group, district, area)
           VALUES ('nonexistent_uid', 'BS-ORPHAN-1', 'Orphan', 'O+', 'Dhaka', 'Mirpur')`
        );
      }
    );
  });

  it('2. Enforces Neon TLS certificate security, redacts credentials, blocks VITE_ leaks & static SQL probing', async () => {
    // Reject insecure sslmode=disable
    assert.throws(
      () =>
        validateAndNormalizeNeonUrl(
          'postgresql://user:secretpass@ep-cool-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=disable',
          { env: { NODE_ENV: 'production' } }
        ),
      /INSECURE_TLS_CONFIG/
    );

    // Auto-upgrade missing sslmode on Neon host to sslmode=verify-full and detect -pooler
    const validInfo = validateAndNormalizeNeonUrl(
      'postgresql://bloodsearch_app:SuperSecret99!@ep-crimson-pooler.ap-southeast-1.aws.neon.tech/neondb',
      { env: { NODE_ENV: 'production', NEON_PLAN_TIER: 'FREE' } }
    );
    assert.equal(validInfo.sslMode, 'verify-full');
    assert.equal(validInfo.isNeonHost, true);
    assert.equal(validInfo.isPooledEndpoint, true);
    assert.ok(!validInfo.redactedUrl.includes('SuperSecret99!'), 'Redacted URL must never contain raw password');
    assert.ok(redactDatabaseUrl('postgresql://admin:MySecretPass@host/db').includes('********'));

    // Reject VITE_DATABASE_URL leak attempt
    assert.throws(
      () =>
        validateAndNormalizeNeonUrl('postgresql://u:p@ep-test-pooler.aws.neon.tech/neondb?sslmode=verify-full', {
          env: { VITE_DATABASE_URL: 'postgresql://leaked' },
        }),
      /SECURITY_BLOCK/
    );

    // Express static firewall must block direct HTTP access to SQL migrations, Drizzle config & schema
    const probeSql = await fetch(`${baseUrl}/drizzle/0000_0000_bloodsearch_neon_core.sql`);
    assert.equal(probeSql.status, 403);
    const probeSchema = await fetch(`${baseUrl}/src/db/schema.ts`);
    assert.equal(probeSchema.status, 403);
    const probeBackup = await fetch(`${baseUrl}/backups/neon-backup-latest.json`);
    assert.equal(probeBackup.status, 403);
  });

  it('3. Evaluates Neon Free Plan health monitor and protects detailed storage telemetry behind Admin RBAC', async () => {
    const publicHealth = await apiJson('GET', '/api/v1/db/health');
    assert.equal(publicHealth.status, 200);
    assert.equal(publicHealth.json.ok, true);
    assert.equal(publicHealth.json.activeGeoStrategy, 'INDEXED_BOUNDING_BOX_HAVERSINE');
    assert.equal(publicHealth.json.report, undefined, 'Public caller must not receive internal connection report');

    const adminHealth = await apiJson('GET', '/api/v1/db/health', { token: 'token-super-admin' });
    assert.equal(adminHealth.status, 200);
    assert.equal(adminHealth.json.report.storage.freePlanLimitMb, 1024);
    assert.ok(Array.isArray(adminHealth.json.report.freePlanAdvisories));

    const directEval = await evaluateNeonHealthAndLimits(
      db,
      validateAndNormalizeNeonUrl(
        'postgresql://app:StrongPass123@ep-demo-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full',
        { env: { NEON_PLAN_TIER: 'FREE' } }
      )
    );
    assert.equal(directEval.status, 'HEALTHY');
  });

  it('4. Registers donors (preserving null manual age), runs paginated Lat/Lng Haversine search & leaks zero raw phones', async () => {
    // Donor 1: Dhanmondi (O-, REQUEST_ONLY, manual age omitted -> must stay null, never auto-filled!)
    const d1 = await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-donor-dhanmondi',
      body: {
        displayName: 'Tanvir Hasan',
        bloodGroup: 'O-',
        district: 'Dhaka',
        area: 'Dhanmondi 27',
        latitude: 23.7515,
        longitude: 90.3742,
        phone: '01711223344',
        shareDirectContact: false,
        contactPreference: 'IN_APP_ONLY',
        contactVisibility: 'REQUEST_ONLY',
        medicalDeclarationAccepted: true,
        role: 'SUPER_ADMIN', // Forged client role field — must be ignored!
      },
    });
    assert.equal(d1.status, 201);
    assert.equal(d1.json.profile.age, null, 'Age must remain null when not manually provided by user');

    // Donor 2: Gulshan (A+, PUBLIC_OPT_IN, manual age = 27)
    const d2 = await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-donor-gulshan',
      body: {
        displayName: 'Nusrat Jahan',
        bloodGroup: 'A+',
        age: 27,
        gender: 'FEMALE',
        district: 'Dhaka',
        area: 'Gulshan 1',
        latitude: 23.7806,
        longitude: 90.4167,
        phone: '+8801819887766',
        shareDirectContact: true,
        contactPreference: 'CALL_ALLOWED',
        contactVisibility: 'PUBLIC_OPT_IN',
        medicalDeclarationAccepted: true,
      },
    });
    assert.equal(d2.status, 201);
    assert.equal(d2.json.profile.age, 27);

    // Donor 3: Chattogram (A+, DND — ~240km away)
    const d3 = await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-donor-ctg-dnd',
      body: {
        displayName: 'Karim Uddin',
        bloodGroup: 'A+',
        age: 31,
        district: 'Chattogram',
        area: 'Panchlaish',
        latitude: 22.3636,
        longitude: 91.8294,
        phone: '01912345678',
        shareDirectContact: false,
        contactPreference: 'DND',
        medicalDeclarationAccepted: true,
      },
    });
    assert.equal(d3.status, 201);

    // Search compatible donors for A+ near Square Hospital (Panthapath: 23.7528, 90.3816) within 15 km
    const search = await apiJson(
      'GET',
      '/api/v1/donors/search?bloodGroup=A%2B&includeCompatible=true&lat=23.7528&lng=90.3816&radiusKm=15&page=1&limit=10'
    );
    assert.equal(search.status, 200);
    assert.equal(search.json.geoStrategy, 'INDEXED_BOUNDING_BOX_HAVERSINE');
    assert.equal(search.json.items.length, 2, 'Should match Dhanmondi (O-) and Gulshan (A+) within 15km, excluding Chattogram');
    assert.equal(search.json.items[0].userUid, 'uid_donor_dhanmondi', 'Closest donor (~0.8km) must rank first');
    assert.ok(search.json.items[0].distanceKm < search.json.items[1].distanceKm);

    // Verify ZERO raw phone numbers appear anywhere in search JSON
    const serialized = JSON.stringify(search.json);
    assert.ok(!serialized.includes('1711223344'), 'Raw phone of Donor 1 must never leak in search response');
    assert.ok(!serialized.includes('1819887766'), 'Raw phone of Donor 2 must never leak in search response');
  });

  it('5. Defeats SQL Injection payloads & IDOR profile/consent tampering', async () => {
    // SQL injection payload in search query and district filter
    const sqli = await apiJson(
      'GET',
      `/api/v1/donors/search?district=${encodeURIComponent("Dhaka' OR '1'='1")}&q=${encodeURIComponent("'; DROP TABLE users; --")}`
    );
    assert.equal(sqli.status, 200);
    assert.equal(sqli.json.items.length, 0);

    // Attacker attempts IDOR overwrite of Donor 1's profile
    const idorAttempt = await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-attacker-mallory',
      body: {
        targetUid: 'uid_donor_dhanmondi',
        displayName: 'Hacked Name',
        bloodGroup: 'O-',
        district: 'Dhaka',
        area: 'Dhanmondi',
        phone: '01611000000',
        medicalDeclarationAccepted: true,
      },
    });
    assert.equal(idorAttempt.status, 403);
    assert.equal(idorAttempt.json.code, 'FORBIDDEN_IDOR');
  });

  it('6. Enforces private donor contact isolation (DND lock, Request-Only consent gate, & audited unmasking)', async () => {
    // 1) DND donor contact unmask must be blocked
    const dndRes = await apiJson('GET', '/api/v1/donors/uid_donor_ctg_dnd/contact', {
      token: 'token-seeker-rahim',
    });
    assert.equal(dndRes.status, 403);
    assert.equal(dndRes.json.code, 'DONOR_DND_PRIVATE');

    // 2) REQUEST_ONLY donor contact unmask before consent must be blocked
    const blockedReqOnly = await apiJson('GET', '/api/v1/donors/uid_donor_dhanmondi/contact', {
      token: 'token-seeker-rahim',
    });
    assert.equal(blockedReqOnly.status, 403);
    assert.equal(blockedReqOnly.json.code, 'CONSENT_REQUIRED');

    // 3) Seeker sends contact consent request
    const reqConsent = await apiJson('POST', '/api/v1/donors/uid_donor_dhanmondi/contact-request', {
      token: 'token-seeker-rahim',
      body: { reason: 'Emergency O- blood needed at DMCH ICU Ward 4' },
    });
    assert.equal(reqConsent.status, 201);
    const consentId = reqConsent.json.consent.id;

    // 4) Attacker tries to approve someone else's consent (IDOR) -> 403
    const hijackApprove = await apiJson('POST', `/api/v1/consents/${consentId}/respond`, {
      token: 'token-attacker-mallory',
      body: { decision: 'GRANTED' },
    });
    assert.equal(hijackApprove.status, 403);

    // 5) Real donor grants consent -> seeker can now unmask phone, and audit_logs records UNMASK_PHONE_GRANTED
    const realApprove = await apiJson('POST', `/api/v1/consents/${consentId}/respond`, {
      token: 'token-donor-dhanmondi',
      body: { decision: 'GRANTED' },
    });
    assert.equal(realApprove.status, 200);

    const allowedUnmask = await apiJson('GET', '/api/v1/donors/uid_donor_dhanmondi/contact', {
      token: 'token-seeker-rahim',
    });
    assert.equal(allowedUnmask.status, 200);
    assert.equal(allowedUnmask.json.contact.phoneE164, '+8801711223344');

    // 6) Donor revokes consent -> subsequent unmask is immediately blocked again!
    await apiJson('POST', `/api/v1/consents/${consentId}/respond`, {
      token: 'token-donor-dhanmondi',
      body: { decision: 'REVOKED' },
    });
    const afterRevoke = await apiJson('GET', '/api/v1/donors/uid_donor_dhanmondi/contact', {
      token: 'token-seeker-rahim',
    });
    assert.equal(afterRevoke.status, 403);
  });

  it('7. Protects Super Admin & Co-Admin boundaries and blood inventory management', async () => {
    // Spoofed unverified Super Owner email must NOT get admin privileges
    const spoofAttempt = await apiJson('POST', '/api/v1/admin/roles', {
      token: 'token-spoof-unverified-super',
      body: { targetUid: 'uid_coadmin_01', targetEmail: 'coadmin@bloodsearch.org', role: 'CO_ADMIN' },
    });
    assert.equal(spoofAttempt.status, 403);

    // Verified Super Owner grants CO_ADMIN role
    const grantCoAdmin = await apiJson('POST', '/api/v1/admin/roles', {
      token: 'token-super-admin',
      body: { targetUid: 'uid_coadmin_01', targetEmail: 'coadmin@bloodsearch.org', role: 'CO_ADMIN', isActive: true },
    });
    assert.equal(grantCoAdmin.status, 200);

    // Co-Admin CAN update blood bank inventory
    const invUpdate = await apiJson('POST', '/api/v1/admin/blood-inventory', {
      token: 'token-coadmin',
      body: {
        bloodBankCode: 'DMCH-BANK-01',
        bloodBankName: 'Dhaka Medical College Blood Bank',
        district: 'Dhaka',
        address: 'Secretariat Rd, Dhaka 1000',
        contactPhone: '02-55165088',
        bloodGroup: 'O-',
        unitsAvailable: 3,
        criticalThreshold: 5,
      },
    });
    assert.equal(invUpdate.status, 200);
    assert.equal(invUpdate.json.inventory.stockStatus, 'CRITICAL');

    // Co-Admin CANNOT escalate privileges or grant another Co-Admin role
    const coAdminEscalation = await apiJson('POST', '/api/v1/admin/roles', {
      token: 'token-coadmin',
      body: { targetUid: 'uid_attacker_mallory', targetEmail: 'mallory@example.com', role: 'CO_ADMIN' },
    });
    assert.equal(coAdminEscalation.status, 403);
    assert.equal(coAdminEscalation.json.code, 'SUPER_ADMIN_REQUIRED');
  });

  it('8. Enforces transactional SOS blood request creation, alert halting, donation cooldown & terminal state locks', async () => {
    const createSos = await apiJson('POST', '/api/v1/requests', {
      token: 'token-seeker-rahim',
      body: {
        patientName: 'Ayesha Begum',
        bloodGroup: 'A+',
        bagsNeeded: 2,
        urgency: 'CRITICAL',
        hospitalName: 'Square Hospital',
        district: 'Dhaka',
        area: 'Panthapath',
        latitude: 23.7528,
        longitude: 90.3816,
        contactName: 'Rahim',
        contactPhone: '01755667788',
        shareDirectContact: false,
      },
    });
    assert.equal(createSos.status, 201);
    const requestId = createSos.json.request.id;
    assert.equal(createSos.json.alertsDispatched, 2, 'Should dispatch SOS alerts to both compatible Dhaka donors');

    // Public request feed masks private contact phone when shareDirectContact=false
    const publicFeed = await apiJson('GET', '/api/v1/requests?status=ACTIVE');
    assert.equal(publicFeed.status, 200);
    const listed = publicFeed.json.items.find((r: any) => r.id === requestId);
    assert.equal(listed.contactPhone, null);
    assert.ok(listed.maskedContactPhone.includes('****'));

    // Donor responds ACCEPTED
    const respond = await apiJson('POST', `/api/v1/requests/${requestId}/respond`, {
      token: 'token-donor-gulshan',
      body: { responseStatus: 'ACCEPTED', etaMinutes: 20 },
    });
    assert.equal(respond.status, 200);

    // Non-owner Mallory tries to cancel -> 403 FORBIDDEN_NOT_OWNER
    const malloryCancel = await apiJson('POST', `/api/v1/requests/${requestId}/transition`, {
      token: 'token-attacker-mallory',
      body: { nextStatus: 'CANCELLED' },
    });
    assert.equal(malloryCancel.status, 403);

    // Owner marks FULFILLED with donor `uid_donor_gulshan`
    const fulfill = await apiJson('POST', `/api/v1/requests/${requestId}/transition`, {
      token: 'token-seeker-rahim',
      body: {
        nextStatus: 'FULFILLED',
        reason: '2 bags transfused successfully',
        fulfilledByDonorUid: 'uid_donor_gulshan',
        unitsDonated: 1,
      },
    });
    assert.equal(fulfill.status, 200);
    assert.equal(fulfill.json.request.status, 'FULFILLED');
    assert.equal(fulfill.json.haltedAlertsCount, 2, 'All open emergency alerts must atomically stop');
    assert.ok(fulfill.json.donation?.certificateCode?.startsWith('CERT-'));

    // Verify open emergency_alerts are now STOPPED_RESOLVED and donor is in 90-day COOLDOWN
    const remainingOpenAlerts = await db
      .select()
      .from(emergencyAlerts)
      .where(eq(emergencyAlerts.requestId, requestId));
    assert.ok(remainingOpenAlerts.every((a) => a.alertState === 'STOPPED_RESOLVED'));

    const [updatedDonor] = await db
      .select()
      .from(donorProfiles)
      .where(eq(donorProfiles.userUid, 'uid_donor_gulshan'));
    assert.equal(updatedDonor?.availabilityStatus, 'COOLDOWN');
    assert.equal(updatedDonor?.isAvailable, false);
    assert.equal(updatedDonor?.totalDonations, 1);

    const [donationRow] = await db.select().from(donations).where(eq(donations.requestId, requestId));
    assert.ok(donationRow);

    // Terminal state lock: attempting to CANCEL or ESCALATE an already FULFILLED request must fail with 409
    const reCancel = await apiJson('POST', `/api/v1/requests/${requestId}/transition`, {
      token: 'token-seeker-rahim',
      body: { nextStatus: 'CANCELLED' },
    });
    assert.equal(reCancel.status, 409);
    assert.equal(reCancel.json.code, 'INVALID_TERMINAL_TRANSITION');

    const postEscalate = await apiJson('POST', `/api/v1/requests/${requestId}/escalate`, {
      token: 'token-seeker-rahim',
    });
    assert.equal(postEscalate.status, 409);
  });

  it('9. Executes 28-table Neon logical backup, SHA-256 tamper block, SQL rollback, & lossless restore roundtrip', async () => {
    const backupBundle = await exportNeonLogicalBackup(db);
    assert.equal(backupBundle.tableOrder.length, 28);
    assert.ok(backupBundle.tableCounts.users >= 4);
    assert.ok(backupBundle.tableCounts.audit_logs >= 6);

    const tamperedBundle = structuredClone(backupBundle);
    tamperedBundle.tableCounts.users += 999;
    await assert.rejects(
      async () => restoreAndVerifyNeonBackup(db, tamperedBundle),
      /BACKUP_INTEGRITY_FAILED/
    );

    const rollbackSql = fs.readFileSync(path.join(ROOT_DIR, 'drizzle', 'rollback_0000_drop_all.sql'), 'utf8');
    await pgClient.exec(rollbackSql);

    const afterRollback = await pgClient.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'`
    );
    assert.equal(afterRollback.rows[0]?.cnt, 0, 'Rollback SQL must cleanly drop all 28 schema tables');

    await pgClient.exec(findCoreMigrationSql().replace(/--> statement-breakpoint/g, '\n'));
    const restoreOutcome = await restoreAndVerifyNeonBackup(db, backupBundle);
    assert.equal(restoreOutcome.restoredTables, 28);
    assert.equal(restoreOutcome.verifiedCountsMatch, true);

    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)::int` }).from(auditLogs);
    assert.equal(cnt, backupBundle.tableCounts.audit_logs);
  });

  it('10. Blocks vulnerability scanners, sensitive files, cross-site CSRF, operator/prototype injection & admin brute-force while serving opted-in Call/WhatsApp/SMS/Facebook', async () => {
    // 1) Automated scanner User-Agent (`sqlmap`) must be immediately rejected with 403 FORBIDDEN_SCANNER
    const scannerResp = await fetch(`${baseUrl}/api/v1/donors/search`, {
      headers: { 'User-Agent': 'sqlmap/1.8.2#stable (https://sqlmap.org)' },
    });
    assert.equal(scannerResp.status, 403);
    const scannerJson = await scannerResp.json();
    assert.equal(scannerJson.code, 'FORBIDDEN_SCANNER');

    // 2) Sensitive server, database, migration & source files must be blocked with 403 FORBIDDEN_RESOURCE
    for (const secretPath of [
      '/server.ts',
      '/.env',
      '/.data/bloodsearch-main-pg',
      '/drizzle/0000_0000_bloodsearch_neon_core.sql',
      '/SECURITY_AUDIT.md',
      '/src/db/index.ts',
    ]) {
      const probe = await fetch(`${baseUrl}${secretPath}`);
      assert.equal(probe.status, 403, `Expected ${secretPath} to be blocked with 403`);
    }

    // 3) Cross-site CSRF Origin mismatch on state-changing POST /api/v1/* must be blocked with 403
    const csrfResp = await fetch(`${baseUrl}/api/v1/donors/profile`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-donor-gulshan',
        'Content-Type': 'application/json',
        Origin: 'https://evil-phishing-attacker.example.com',
      },
      body: JSON.stringify({
        displayName: 'CSRF Probe',
        bloodGroup: 'A+',
        district: 'Dhaka',
      }),
    });
    assert.equal(csrfResp.status, 403);

    // 4) Malicious `$where` / operator injection payload in JSON body must be blocked with 400 MALICIOUS_PAYLOAD_BLOCKED
    const opInjectResp = await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-donor-gulshan',
      body: {
        displayName: 'Injector',
        '$where': 'function() { return true; }',
      },
    });
    assert.equal(opInjectResp.status, 400);
    assert.equal(opInjectResp.json.code, 'MALICIOUS_PAYLOAD_BLOCKED');

    // 5) Opted-in donor (`uid_donor_gulshan`, shareDirectContact=true, PUBLIC_OPT_IN) serves Call/WhatsApp/SMS/Facebook,
    //    whereas private donor (`uid_donor_dhanmondi`, shareDirectContact=false) is strictly denied (403)!
    await apiJson('POST', '/api/v1/donors/profile', {
      token: 'token-donor-gulshan',
      body: {
        displayName: 'Nusrat Jahan',
        bloodGroup: 'A+',
        age: 26,
        weightKg: 56,
        gender: 'FEMALE',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Gulshan',
        area: 'Niketon, Gulshan-1',
        latitude: 23.7798,
        longitude: 90.4126,
        isAvailable: true,
        availabilityStatus: 'AVAILABLE',
        phone: '01812345678',
        whatsappNumber: '01812345678',
        facebookUrl: 'https://facebook.com/nusrat.donor',
        shareDirectContact: true,
        contactVisibility: 'PUBLIC_OPT_IN',
        allowCall: true,
        allowWhatsApp: true,
        allowSms: true,
      },
    });

    const optedInRes = await apiJson('GET', '/api/v1/donors/uid_donor_gulshan/opted-in-contact');
    assert.equal(optedInRes.status, 200);
    assert.equal(optedInRes.json.contact.phoneE164, '+8801812345678');
    assert.equal(optedInRes.json.contact.whatsappNumber, '+8801812345678');
    assert.equal(optedInRes.json.contact.facebookUrl, 'https://facebook.com/nusrat.donor');
    assert.equal(optedInRes.json.contact.allowCall, true);
    assert.equal(optedInRes.json.contact.allowWhatsApp, true);
    assert.equal(optedInRes.json.contact.allowSms, true);

    const privateBlockedRes = await apiJson('GET', '/api/v1/donors/uid_donor_dhanmondi/opted-in-contact');
    assert.equal(privateBlockedRes.status, 403);

    // 6) `/api/v1/auth/admin-verify` verifies Super Owner cleanly, never leaks owner email to attackers,
    //    and locks out Mallory with 429 ADMIN_BRUTE_FORCE_LOCKED after 5 unauthorized probes!
    const validSuperCheck = await apiJson('GET', '/api/v1/auth/admin-verify', {
      token: 'token-super-admin',
    });
    assert.equal(validSuperCheck.status, 200);
    assert.equal(validSuperCheck.json.isAdmin, true);
    assert.equal(validSuperCheck.json.isSuperAdmin, true);

    for (let attempt = 1; attempt <= 5; attempt++) {
      const failCheck = await apiJson('GET', '/api/v1/auth/admin-verify', {
        token: 'token-attacker-mallory',
      });
      assert.equal(failCheck.status, 200);
      assert.equal(failCheck.json.isAdmin, false);
      assert.equal(
        JSON.stringify(failCheck.json).includes('shamimrakib015'),
        false,
        'Admin verify response must never leak Super Owner email'
      );
    }

    const lockedCheck = await apiJson('GET', '/api/v1/auth/admin-verify', {
      token: 'token-attacker-mallory',
    });
    assert.equal(lockedCheck.status, 429);
    assert.equal(lockedCheck.json.code, 'ADMIN_BRUTE_FORCE_LOCKED');
  });
});

