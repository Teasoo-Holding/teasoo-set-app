-- EP1-S1 / TEN-1 — tenant isolation, database layer.
--
-- This migration creates the tenant-scoped schema and its row-level-security
-- policy. RLS is the SECOND line of defence: even if an application query
-- forgets to filter by tenant, the database refuses to return or write another
-- tenant's rows.
--
-- IMPORTANT: RLS is bypassed by superusers and by roles with BYPASSRLS. The
-- application must therefore connect as an ordinary role. Provision it once
-- (outside this migration, since it needs a password), e.g.:
--
--   CREATE ROLE teasoo_app LOGIN PASSWORD '...';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO teasoo_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO teasoo_app;
--
-- The application sets `app.current_tenant_id` per transaction (see
-- PrismaService.withTenant); the policy below reads it.

CREATE TABLE "tenants" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"       text NOT NULL UNIQUE,
  "name"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "stakeholders" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id"),
  "name"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "stakeholders_tenant_id_idx" ON "stakeholders" ("tenant_id");

-- Turn on row-level security. FORCE makes it apply to the table owner too, so
-- the policy cannot be sidestepped by whoever owns the table.
ALTER TABLE "stakeholders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stakeholders" FORCE ROW LEVEL SECURITY;

-- Only rows for the current tenant are visible (USING) or writable (WITH CHECK).
-- current_setting(..., true) returns NULL when the GUC is unset; NULLIF also maps
-- an empty-string GUC to NULL so a cleared session fails closed (sees/writes NO
-- rows) instead of erroring on an ''::uuid cast.
CREATE POLICY "tenant_isolation" ON "stakeholders"
  USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
