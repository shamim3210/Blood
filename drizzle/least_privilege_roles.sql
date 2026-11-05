-- ============================================================================
-- BLOODSEARCH NEON POSTGRESQL LEAST-PRIVILEGE ROLE SEPARATION
-- ============================================================================
-- Run this script ONCE as your Neon branch owner (`neondb_owner`) to separate
-- schema migration privileges from runtime Express API privileges.
-- Replace `<STRONG_RANDOM_MIGRATOR_PASSWORD>` and `<STRONG_RANDOM_APP_PASSWORD>`
-- in your secret manager before executing.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloodsearch_migrator') THEN
    CREATE ROLE bloodsearch_migrator WITH LOGIN PASSWORD 'CHANGE_ME_MIGRATOR_SECRET';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bloodsearch_app_runtime') THEN
    CREATE ROLE bloodsearch_app_runtime WITH LOGIN PASSWORD 'CHANGE_ME_RUNTIME_SECRET';
  END IF;
END
$$;

-- 1. Migrator Role (used ONLY in CI/CD via DIRECT_DATABASE_URL for `npm run db:migrate`)
GRANT CONNECT ON DATABASE neondb TO bloodsearch_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO bloodsearch_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bloodsearch_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bloodsearch_migrator;

-- 2. Runtime Application Role (used by Express API via pooled DATABASE_URL)
-- Strictly limited to DML (SELECT, INSERT, UPDATE, DELETE). Cannot DROP, ALTER, or TRUNCATE tables.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE neondb TO bloodsearch_app_runtime;
GRANT USAGE ON SCHEMA public TO bloodsearch_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bloodsearch_app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bloodsearch_app_runtime;

-- Protect immutable audit_logs from accidental runtime DELETE
REVOKE DELETE ON TABLE public.audit_logs FROM bloodsearch_app_runtime;

-- Automatically apply least-privilege DML grants to future tables created by bloodsearch_migrator
ALTER DEFAULT PRIVILEGES FOR ROLE bloodsearch_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bloodsearch_app_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE bloodsearch_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bloodsearch_app_runtime;
