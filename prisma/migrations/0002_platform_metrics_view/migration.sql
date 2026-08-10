-- EP1-S2 / TEN-2 — cross-tenant isolation.
--
-- Cross-tenant reads must exist ONLY as a metadata-only projection consumed by a
-- separate analytics path — never names, never engagement notes. This migration
-- makes that guarantee structural, not a matter of discipline:
--
--   * a view that exposes only counts and timestamps (plus the tenant's own
--     slug, needed to identify the tenant), and
--   * an analytics role that can read that view and NOTHING else — no privilege
--     on the base tables, so it physically cannot select a stakeholder name.
--
-- OWNERSHIP REQUIREMENT: the view aggregates across every tenant, so it must be
-- owned by a role that is not subject to the stakeholders RLS policy — a
-- superuser or a dedicated platform role created WITH BYPASSRLS. A view runs
-- with its owner's privileges by default (security_invoker = false), so the
-- analytics role reads cross-tenant totals through the view without ever holding
-- rights on the base tables. In production:
--   ALTER VIEW platform_tenant_metrics OWNER TO teasoo_platform;   -- BYPASSRLS role
-- ENVIRONMENT: grant teasoo_analytics LOGIN + a password (or connection-role
-- membership) per environment; point ANALYTICS_DATABASE_URL at it.

CREATE VIEW "platform_tenant_metrics" AS
SELECT
  t."id"                       AS tenant_id,
  t."slug"                     AS slug,
  count(s."id")::int           AS stakeholder_count,
  max(s."created_at")          AS last_stakeholder_at,
  t."created_at"               AS tenant_created_at
FROM "tenants" t
LEFT JOIN "stakeholders" s ON s."tenant_id" = t."id"
GROUP BY t."id", t."slug", t."created_at";

-- Provision the analytics role if it does not already exist (roles are cluster
-- global, so guard the create), then restrict it to the view alone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teasoo_analytics') THEN
    CREATE ROLE teasoo_analytics NOLOGIN;
  END IF;
END$$;

GRANT SELECT ON "platform_tenant_metrics" TO teasoo_analytics;

-- Belt and braces: the analytics role must never touch the base tables.
REVOKE ALL ON "tenants" FROM teasoo_analytics;
REVOKE ALL ON "stakeholders" FROM teasoo_analytics;
