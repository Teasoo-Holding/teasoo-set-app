-- EP1-S6 / AUTH-2 — resolve role/function/reporting-line with tenant-configurable
-- precedence between IdP claims and the SET user record.

ALTER TABLE "users" ADD COLUMN "reports_to_id" uuid REFERENCES "users"("id");

CREATE TABLE "tenant_auth_settings" (
  "tenant_id"        uuid PRIMARY KEY REFERENCES "tenants"("id"),
  -- 'record_first' (default; the SET record is authoritative) or 'idp_first'.
  "precedence"       text NOT NULL DEFAULT 'record_first',
  -- Dotted JWT claim paths carrying each attribute, e.g. 'app_metadata.role'.
  "role_claim"       text,
  "function_claim"   text,
  "reports_to_claim" text
);
