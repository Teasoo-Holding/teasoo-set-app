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
npm test            # fast unit tests (tenant context, scope logic, middleware)
npm run verify:rls  # TEN-1: proves Postgres RLS isolates tenants, via PGlite (no DB server needed)
npm run verify:ten2 # TEN-2: proves cross-tenant reads exist only as a metadata-only projection
npm run typecheck   # full TypeScript type-check
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
