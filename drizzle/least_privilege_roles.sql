-- ============================================================================
-- BLOODSEARCH NEON POSTGRESQL LEAST-PRIVILEGE RUNTIME GRANTS
-- ============================================================================
-- Create bloodsearch_app_runtime with SQL as neondb_owner before running this
-- script. Neon Console-created roles may inherit neon_superuser privileges.
-- This file contains no password and is safe to rerun after migrations.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloodsearch_app_runtime') THEN
    RAISE EXCEPTION 'Create bloodsearch_app_runtime with SQL before running this script.';
  END IF;

  IF pg_has_role('bloodsearch_app_runtime', 'neon_superuser', 'MEMBER')
     OR EXISTS (
       SELECT 1
       FROM pg_roles
       WHERE rolname = 'bloodsearch_app_runtime'
         AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
     ) THEN
    RAISE EXCEPTION 'bloodsearch_app_runtime has elevated privileges; do not grant application access.';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Apply npm run db:migrate before granting runtime privileges.';
  END IF;
END
$$;

-- Migrations run as neondb_owner through a trusted, direct connection. Never
-- use that owner connection for the application API or store it in Vercel.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO bloodsearch_app_runtime;
GRANT USAGE ON SCHEMA public TO bloodsearch_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bloodsearch_app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bloodsearch_app_runtime;

-- Keep audit rows append-only for the runtime API.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM bloodsearch_app_runtime;

-- Future objects created by the migration owner receive the same DML grants.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bloodsearch_app_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bloodsearch_app_runtime;
