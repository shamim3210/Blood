-- ============================================================================
-- BLOODSEARCH NEON POSTGRESQL LEAST-PRIVILEGE ROLE GRANTS
-- ============================================================================
-- Create bloodsearch_migrator and bloodsearch_app_runtime in the Neon Console
-- Roles page first. This file intentionally contains no passwords or CREATE
-- ROLE statements. Run as neondb_owner after applying the schema migration;
-- safe to rerun after later migrations to reapply grants.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloodsearch_migrator') THEN
    RAISE EXCEPTION 'Create bloodsearch_migrator in Neon Console -> Roles before running this script.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloodsearch_app_runtime') THEN
    RAISE EXCEPTION 'Create bloodsearch_app_runtime in Neon Console -> Roles before running this script.';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Apply npm run db:migrate with DIRECT_DATABASE_URL before granting runtime privileges.';
  END IF;
END
$$;

-- 1. Migrator Role (used ONLY with DIRECT_DATABASE_URL for `npm run db:migrate`)
GRANT CONNECT ON DATABASE neondb TO bloodsearch_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO bloodsearch_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bloodsearch_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bloodsearch_migrator;

-- 2. Runtime Application Role (used by the API via pooled DATABASE_URL)
-- DML only; never grant schema creation, DDL, or TRUNCATE to the runtime role.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO bloodsearch_app_runtime;
GRANT USAGE ON SCHEMA public TO bloodsearch_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bloodsearch_app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bloodsearch_app_runtime;

-- Keep audit rows append-only for the runtime API.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs FROM bloodsearch_app_runtime;

-- Automatically apply least-privilege DML grants to future tables created by bloodsearch_migrator.
ALTER DEFAULT PRIVILEGES FOR ROLE bloodsearch_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bloodsearch_app_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE bloodsearch_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bloodsearch_app_runtime;
