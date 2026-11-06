import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMainPostgresReady } from '../src/db/index';
import {
  hashPasswordScrypt,
  registerEmailPasswordUserTx,
  loginEmailPasswordUserTx,
} from '../src/server/authAndSessionService';
import {
  deleteOwnUserAndDonorAccountTx,
  adminDeleteUserTx,
} from '../src/db/repositories/bloodSearchRepo';
import { adminRoles, users, authIdentities, loginSessions } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('Step-by-Step User Lifecycle Verification (Create, Login, SuperAdmin, Delete)', () => {
  const adminEmail = 'shamimrakib015@gmail.com';
  const adminPass = 'AdminPass2026!';
  let previousSuperAdminEmail: string | undefined;

  before(async () => {
    previousSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    process.env.SUPER_ADMIN_EMAIL = adminEmail;

    const { db } = await ensureMainPostgresReady();
    assert.ok(db, 'Database instance must be initialized');
    const [existingOwner] = await db.select({ uid: users.uid }).from(users).where(eq(users.email, adminEmail)).limit(1);
    const ownerUid = existingOwner?.uid || 'usr_test_super_owner';

    await db
      .insert(users)
      .values({
        uid: ownerUid,
        email: adminEmail,
        emailVerified: true,
        displayName: 'Test Super Owner',
        authProvider: 'EMAIL_PASSWORD',
        accountStatus: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { emailVerified: true, displayName: 'Test Super Owner', accountStatus: 'ACTIVE' },
      });

    await db
      .insert(adminRoles)
      .values({ userUid: ownerUid, email: adminEmail, role: 'SUPER_ADMIN', isActive: true })
      .onConflictDoUpdate({
        target: adminRoles.userUid,
        set: { email: adminEmail, role: 'SUPER_ADMIN', isActive: true },
      });

    const passwordHash = await hashPasswordScrypt(adminPass);
    const [existingIdentity] = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.providerSubject, adminEmail))
      .limit(1);
    if (existingIdentity) {
      await db
        .update(authIdentities)
        .set({
          provider: 'EMAIL_PASSWORD',
          userUid: ownerUid,
          email: adminEmail,
          emailVerified: true,
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(authIdentities.id, existingIdentity.id));
    } else {
      await db.insert(authIdentities).values({
        userUid: ownerUid,
        provider: 'EMAIL_PASSWORD',
        providerSubject: adminEmail,
        email: adminEmail,
        emailVerified: true,
        passwordHash,
      });
    }
  });

  after(() => {
    if (previousSuperAdminEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
    else process.env.SUPER_ADMIN_EMAIL = previousSuperAdminEmail;
  });

  it('Step 1-4: Creates a fresh user, logs in with password, verifies session & credentials', async () => {
    const { db } = await ensureMainPostgresReady();
    assert.ok(db, 'Database instance must be initialized');
    const database = db;

    const testEmail = `lifecycle_${Date.now()}@test.bloodsearch.bd`;
    const testPassword = 'StrongPassword123!';
    const testName = 'Step Test User';

    // Step 1: Register user
    const regSession = await registerEmailPasswordUserTx(database, {
      email: testEmail,
      password: testPassword,
      displayName: testName,
      ipHash: 'test_ip_hash',
      userAgent: 'TestAgent/1.0',
    });

    assert.ok(regSession.sessionToken, 'Session token should be generated on registration');
    assert.ok(regSession.userProfile.uid, 'User UID should exist');
    assert.equal(regSession.userProfile.email, testEmail);

    // Step 2: Verify user exists in database
    const [dbUser] = await database.select().from(users).where(eq(users.email, testEmail)).limit(1);
    assert.ok(dbUser, 'User must exist in users table');
    assert.equal(dbUser.displayName, testName);

    // Step 3: Login with email & password
    const loginSession = await loginEmailPasswordUserTx(database, {
      email: testEmail,
      password: testPassword,
      ipHash: 'test_ip_hash',
      userAgent: 'TestAgent/1.0',
    });

    assert.ok(loginSession.sessionToken, 'Session token should be issued on login');
    assert.equal(loginSession.userProfile.uid, regSession.userProfile.uid);
    assert.equal(loginSession.actor.role, 'USER');

    // Step 4: Delete the user account (Self-deletion)
    await deleteOwnUserAndDonorAccountTx(database, loginSession.actor);

    // Verify user is deleted from users, authIdentities, and loginSessions
    const [deletedUser] = await database.select().from(users).where(eq(users.email, testEmail)).limit(1);
    assert.equal(deletedUser, undefined, 'User must be deleted from users table');

    const [deletedIdent] = await database
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userUid, regSession.userProfile.uid))
      .limit(1);
    assert.equal(deletedIdent, undefined, 'Identities must be deleted');

    const [deletedSession] = await database
      .select()
      .from(loginSessions)
      .where(eq(loginSessions.userUid, regSession.userProfile.uid))
      .limit(1);
    assert.equal(deletedSession, undefined, 'Sessions must be deleted');
  });

  it('Step 5: Seamless login for new email on Sign-In tab auto-creates and logs in', async () => {
    const { db } = await ensureMainPostgresReady();
    assert.ok(db, 'Database instance must be initialized');
    const database = db;

    const autoEmail = `autocreate_${Date.now()}@test.bloodsearch.bd`;
    const autoPassword = 'MySecretPass123';

    // User didn't register beforehand, just typed email + password on Sign In tab:
    const session = await loginEmailPasswordUserTx(database, {
      email: autoEmail,
      password: autoPassword,
      ipHash: 'test_ip_hash',
      userAgent: 'TestAgent/1.0',
    });

    assert.ok(session.sessionToken, 'Must generate session token seamlessly');
    assert.equal(session.userProfile.email, autoEmail);

    // Clean up
    await deleteOwnUserAndDonorAccountTx(database, session.actor);
  });

  it('Step 6: A provisioned Super Admin logs in and is recognized as SUPER_ADMIN', async () => {
    const { db } = await ensureMainPostgresReady();
    assert.ok(db, 'Database instance must be initialized');
    const database = db;

    const adminSession = await loginEmailPasswordUserTx(database, {
      email: adminEmail,
      password: adminPass,
      ipHash: 'test_ip_hash',
      userAgent: 'TestAgent/1.0',
    });

    assert.ok(adminSession.sessionToken, 'Session token must be issued');
    assert.equal(adminSession.userProfile.email, adminEmail);
    assert.equal(adminSession.actor.role, 'SUPER_ADMIN', 'shamimrakib015@gmail.com must have SUPER_ADMIN role');

    // Admin can delete test users using adminDeleteUserTx
    const tempTestEmail = `temp_for_admin_del_${Date.now()}@test.bloodsearch.bd`;
    const tempUser = await registerEmailPasswordUserTx(database, {
      email: tempTestEmail,
      password: 'TempPassword123!',
      displayName: 'To Be Deleted By Admin',
      ipHash: 'test_ip_hash',
      userAgent: 'TestAgent/1.0',
    });

    const deletedByAdmin = await adminDeleteUserTx(database, adminSession.actor, tempUser.userProfile.uid);
    assert.equal(deletedByAdmin, true, 'Admin delete must succeed');

    const [shouldBeGone] = await database.select().from(users).where(eq(users.email, tempTestEmail)).limit(1);
    assert.equal(shouldBeGone, undefined, 'Temp user must be deleted by admin');
  });

  it('Step 7: A Super Owner cannot replace a password by trying a different one', async () => {
    const { db } = await ensureMainPostgresReady();
    assert.ok(db, 'Database instance must be initialized');
    const database = db;

    const brandNewPass = 'BrandNewPassword999!';

    await assert.rejects(
      loginEmailPasswordUserTx(database, {
        email: adminEmail,
        password: brandNewPass,
        ipHash: 'test_ip_hash',
        userAgent: 'TestAgent/1.0',
      }),
      { code: 'INVALID_CREDENTIALS' }
    );
  });
});
