-- ============================================================================
-- BLOODSEARCH NEON POSTGRESQL — OPTIONAL POSTGIS SPATIAL ACCELERATION
-- ============================================================================
-- Neon supports PostGIS (`CREATE EXTENSION postgis;`) across Free, Launch, and Scale plans.
-- However, BloodSearch verifies `pg_extension` at runtime BEFORE issuing any ST_DWithin query
-- and defaults safely to an indexed Latitude/Longitude Bounding-Box + SQL Haversine search
-- so environments without PostGIS installed never fail.
--
-- Run this script via DIRECT_DATABASE_URL (migrator role) ONLY if you want native GiST geography
-- indexing enabled in Neon:
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- Expression GiST index on geography point derived from (longitude, latitude)
-- Allows zero-schema-drift ST_DWithin(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, ...)
CREATE INDEX IF NOT EXISTS idx_donor_profiles_postgis_geog
  ON donor_profiles
  USING GIST ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hospitals_postgis_geog
  ON hospitals
  USING GIST ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
