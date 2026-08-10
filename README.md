# Teasoo SET — Stakeholder Engagement Tracker

Multi-tenant SaaS that gives an organisation one trustworthy record of every
relationship it maintains with an external stakeholder, and turns that record
into risk visibility for leadership. See [teasoo-set-prd.docx](teasoo-set-prd.docx)
for the full product requirements.

## Project docs

- [BACKLOG.md](BACKLOG.md) — epics & stories (also live as GitHub issues), traced to PRD requirement IDs.
- [DECISIONS.md](DECISIONS.md) — decision log and open questions.

## Stack

NestJS (TypeScript) · Prisma · PostgreSQL. See decision **D-0006** in
[DECISIONS.md](DECISIONS.md).

## Getting started

```bash
npm install
npm run prisma:generate       # generate the Prisma client from prisma/schema.prisma
cp .env.example .env          # then set DATABASE_URL (see note below)
```

**The app must connect to Postgres as a non-superuser role.** Row-level security —
the tenant-isolation backstop — is bypassed by superusers and by any role with
`BYPASSRLS`. Provision an ordinary role and point `DATABASE_URL` at it; see the
header of [prisma/migrations/0001_init_tenant_rls/migration.sql](prisma/migrations/0001_init_tenant_rls/migration.sql).

```bash
npm run prisma:migrate        # apply migrations to the database
npm start                     # run the API
```

## Tests

```bash
npm test              # fast unit tests (tenant context, scope logic, middleware, encryption)
npm run verify:rls    # TEN-1: proves Postgres RLS isolates tenants, via PGlite (no DB server needed)
npm run verify:ten2   # TEN-2: proves cross-tenant reads exist only as a metadata-only projection
npm run verify:crypto # TEN-3: proves per-tenant encryption at rest and crypto-shredding
npm run typecheck     # full TypeScript type-check
```

## Tenant isolation (EP1-S1 / TEN-1)

Every tenant-scoped query is isolated in two independent layers, neither
relying on a developer remembering to filter at the call site:

1. **Application layer.** [`TenantContextMiddleware`](src/tenancy/tenant-context.middleware.ts)
   resolves the tenant per request into an `AsyncLocalStorage`
   ([`TenantContext`](src/tenancy/tenant-context.ts)). A Prisma client extension
   ([`tenantScopeExtension`](src/tenancy/prisma-tenant.extension.ts)) reads that
   context and injects `tenant_id` into every operation on a tenant-owned model,
   failing closed if there is no tenant in scope.
2. **Database layer (second line of defence).** PostgreSQL row-level security
   restricts every read and write to the current tenant, keyed off the
   `app.current_tenant_id` GUC that
   [`PrismaService.withTenant`](src/prisma/prisma.service.ts) sets per
   transaction. Even a query that forgets to filter cannot cross tenants.

### Cross-tenant isolation (EP1-S2 / TEN-2)

No cross-tenant join is possible from the application role — RLS neutralises it.
The only cross-tenant read path is the
[`PlatformAnalyticsService`](src/platform-analytics/platform-analytics.service.ts),
which is a separate connection, is excluded from the tenant middleware, and
reads a **metadata-only view** (`platform_tenant_metrics`: counts and timestamps,
no names or notes). It connects as the `teasoo_analytics` role, which has
`SELECT` on that view and no privilege on the base tables, so it *structurally*
cannot read stakeholder names or engagement notes.

### Per-tenant encryption (EP1-S3 / TEN-3)

Free-text fields are encrypted at rest with AES-256-GCM under a **per-tenant Data
Encryption Key (DEK)**. Envelope encryption: each DEK is stored wrapped by a
master KEK (a KMS-managed key in production; `MASTER_ENCRYPTION_KEY` in dev). The
[`TenantFieldCrypto`](src/encryption/tenant-field-crypto.ts) seam encrypts/decrypts
using the ambient tenant's key — EP-3 (engagement notes) and EP-6 (escalation
descriptions) will call it.

**Contractual deletion = key destruction (crypto-shredding).**
[`TenantKeyService.destroy`](src/encryption/tenant-key.service.ts) drops the
tenant's wrapped DEK and tombstones it; every value ever encrypted under that DEK
becomes permanently unrecoverable, with no need to locate and overwrite each row.

### Roles & permissions (EP1-S10 / §4.1)

Four roles — Field, Function Lead, Leadership, Admin — decoupled from job title
and assigned per user. The [`PERMISSION_MATRIX`](src/authz/permission.ts) is
cumulative (Admin ⊇ Leadership ⊇ Function Lead ⊇ Field). Requests carry a
principal ([`PrincipalMiddleware`](src/authz/principal.middleware.ts) →
[`PrincipalContext`](src/authz/principal-context.ts)), and routes are gated with
[`@RequirePermissions`](src/authz/require-permissions.decorator.ts), enforced by a
global [`PermissionsGuard`](src/authz/permissions.guard.ts) (no permissions
declared → allowed; missing principal → 401; insufficient role → 403).

> The principal is currently read from `x-user-*` headers as a **seam** — a
> stand-in for verified SSO claims. AUTH-1/AUTH-2 (EP1-S5) replaces that source;
> the matrix and guard are what this story delivers.

### Authentication (EP1-S5 / AUTH-1)

Sign-in is enterprise SSO via **Supabase Auth** — Supabase runs the SAML/OIDC
handshake and issues a JWT. The app only **verifies** that JWT
([`SupabaseTokenVerifier`](src/auth/supabase-token-verifier.ts), signature +
issuer + audience + expiry) and then resolves a session
([`SessionResolver`](src/auth/session-resolver.ts)): verified email → domain →
tenant ([`tenant_domains`](prisma/schema.prisma)) → provisioned user → role.
[`SupabaseSessionMiddleware`](src/auth/supabase-session.middleware.ts) attaches
that verified session, and the tenant/principal middlewares prefer it over the
dev `x-*` headers. `GET /auth/me` returns the current identity.

The `x-tenant-id` / `x-user-*` headers remain a **dev-only fallback** for when
Supabase auth is not configured; a present bearer token always wins.

### Deployment modes (EP1-S4 / TEN-4)

The same codebase runs as a **shared** multi-tenant instance (the default —
Unilever's, per OQ-1) or a **dedicated** single-tenant instance, selected by
`DEPLOYMENT_MODE`. A dedicated instance points `DATABASE_URL`,
`ANALYTICS_DATABASE_URL` and `MASTER_ENCRYPTION_KEY` at isolated resources and
sets `DEDICATED_TENANT_SLUG`; the global
[`DedicatedTenantGuard`](src/deployment/dedicated-tenant.guard.ts) then serves
only that tenant (404 for any other). Config is validated fail-fast at startup,
and `GET /health` reports the instance's mode, tenant and region.
