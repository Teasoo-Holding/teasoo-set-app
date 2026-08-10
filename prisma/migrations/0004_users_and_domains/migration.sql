-- EP1-S5 / AUTH-1 — users and email-domain → tenant routing.
--
-- Identity is federated via Supabase Auth (SSO / SAML / OIDC); Supabase performs
-- the handshake and issues a JWT. These tables let the app map a verified email
-- to a tenant (by domain) and to a role/function for authorization.

CREATE TABLE "users" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id"),
  "email"            text NOT NULL,
  "role"             text NOT NULL,
  "function_id"      uuid,
  "status"           text NOT NULL DEFAULT 'active',
  "supabase_user_id" text UNIQUE,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "email")
);

CREATE TABLE "tenant_domains" (
  "domain"    text PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id")
);
