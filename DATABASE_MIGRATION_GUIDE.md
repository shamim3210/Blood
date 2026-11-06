# BloodSearch — Neon PostgreSQL Migration & Recovery

## Database source of truth

The application uses Neon PostgreSQL as its primary database. The Drizzle schema is
`src/db/schema.ts`; the checked-in core migration is
`drizzle/0000_bloodsearch_neon_core.sql`. Together with the parity tables, the schema
contains 28 application tables. There is no Firestore migration or dual-write workflow
in the current project.

## Connection strings

- `DATABASE_URL`: Neon pooled (`-pooler`) PostgreSQL URL used by application runtime.
- `DIRECT_DATABASE_URL`: direct Neon URL used for schema migrations and maintenance.

Use the least-privilege runtime and migration roles described in
`drizzle/least_privilege_roles.sql`. Both URLs must use TLS; `sslmode=verify-full` is
recommended and is the value in `.env.example`. Keep both URLs in a secret manager or
an ignored local `.env`, never in a `VITE_` variable.

## Apply or inspect schema migrations

```powershell
npm run db:generate
npm run db:migrate
npx drizzle-kit check --config=drizzle.config.ts
```

Set `DIRECT_DATABASE_URL` before applying migrations. Review generated SQL and back up
production data before deploying schema changes. The server verifies core-schema readiness at startup. Production never creates
tables with runtime credentials: an incomplete schema fails closed and requires
the checked-in migration to be applied with the migration role.

## Backup and restore verification

```powershell
npm run db:backup
npm run db:restore-verify -- backups/neon-backup-latest.json
```

Backups are written to the ignored `backups/` directory. Restore verification is
destructive: it requires `ALLOW_DESTRUCTIVE_RESTORE=true` and must target an isolated
Neon branch with a verified backup. Never run it against the production branch.

## Initial Super Admin provisioning

`SUPER_ADMIN_EMAIL` does not grant administrator permissions by itself. First sign in
with Google using the matching, verified email. Then, as an authorized database
operator, grant the initial role to that verified Google identity:

```sql
\set super_admin_email 'admin@yourdomain.example.org'

INSERT INTO admin_roles (user_uid, email, role, permissions_json, is_active)
SELECT u.uid, u.email, 'SUPER_ADMIN', '[]'::jsonb, true
FROM users AS u
WHERE lower(u.email) = lower(:'super_admin_email')
  AND u.email_verified = true
  AND EXISTS (
    SELECT 1
    FROM auth_identities AS ai
    WHERE ai.user_uid = u.uid
      AND ai.provider = 'GOOGLE_OIDC'
      AND ai.email_verified = true
  )
ON CONFLICT (user_uid) DO UPDATE
SET email = EXCLUDED.email,
    role = 'SUPER_ADMIN',
    is_active = true,
    updated_at = now()
RETURNING user_uid, email, role, is_active;
```

Confirm exactly one expected row is returned. Replace the example email with the exact
`SUPER_ADMIN_EMAIL` configured in the deployment. Do not grant the role to an
email/password-only identity.

## Available database scripts

The current package provides `db:generate`, `db:migrate`, `db:backup`, and
`db:restore-verify`. Historical Firestore export, verification, and cutover commands
are not part of this project and must not be used as deployment instructions.
