-- Run this in the Supabase SQL Editor AFTER the migrations have been applied.
--
-- It provisions the two roles the application connects as. NEITHER has
-- SUPERUSER or BYPASSRLS, so PostgreSQL row-level security actually enforces
-- (TEN-1). Replace the two passwords, and use them in DATABASE_URL /
-- ANALYTICS_DATABASE_URL.

-- 1) Application role: CRUD on the domain tables (RLS still applies to it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teasoo_app') THEN
    CREATE ROLE teasoo_app LOGIN PASSWORD 'REPLACE_WITH_APP_PASSWORD';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO teasoo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teasoo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO teasoo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teasoo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO teasoo_app;

-- The analytics role must NOT see the base tables (TEN-2). Migration 0002 grants
-- it SELECT on the metadata view only; make sure nothing leaked in via the
-- blanket grant above.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM teasoo_analytics;
GRANT USAGE ON SCHEMA public TO teasoo_analytics;
GRANT SELECT ON platform_tenant_metrics TO teasoo_analytics;

-- 2) Analytics role was created NOLOGIN by migration 0002 — give it a login.
ALTER ROLE teasoo_analytics LOGIN PASSWORD 'REPLACE_WITH_ANALYTICS_PASSWORD';

-- Note: the platform_tenant_metrics view is owned by the migration runner
-- (Supabase 'postgres'), which bypasses RLS, so it aggregates across tenants
-- while teasoo_analytics itself can only read the view. That is intended.
