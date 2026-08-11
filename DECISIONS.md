# Decision Log — Teasoo SET

This file records **decisions we've made** on the Teasoo SET project: what we decided, why, and whether it still stands. It exists so anyone joining later can understand *why the project is the way it is* without having to ask or dig through chat history.

## How to read this file

Each decision is a numbered entry with the same shape:

- **What we decided** — the choice, in one or two plain sentences.
- **Why** — the reason, so the decision can be re-evaluated if the reason changes.
- **Status** — one of:
  - ✅ **Active** — decided and in effect.
  - 🔄 **Superseded** — replaced by a later decision (which is named).
  - ⏳ **Open** — a question we know we need to answer but haven't yet. Not a decision yet; parked here so it isn't forgotten.

Newest decisions go at the **top** of the "Decisions" list. Open questions live in their own section at the bottom.

## How we work (the standing rules)

- **Nothing discussed gets lost.** If we talk about something and decide *not* to build it right now, it goes into the "Parking lot" section of [BACKLOG.md](BACKLOG.md) so it's captured. When it graduates into committed work, it becomes a GitHub issue.
- **Every real decision gets logged here.** When we make a choice that shapes the product or how we build it, add an entry to this file.
- **The backlog lives on GitHub.** Epics are issues, stories are sub-issues under them, in `Teasoo-Holding/teasoo-set-app`. [BACKLOG.md](BACKLOG.md) is the readable source-of-truth that those issues were generated from.

---

## Decisions

### D-0015 — Session timeout enforced per tenant + client type against token start
**What we decided (AUTH-4):** Each tenant configures a session timeout per client type (`tenant_auth_settings`, defaults 12h mobile / 8h desktop). Client type comes from an `x-client-type` header or User-Agent. The resolver rejects a session once `now − sessionStart > timeout`, where `sessionStart` is a configurable stable claim (`authTimeClaim`) or falls back to the token's `iat`. `/auth/me` returns `sessionExpiresAt`.
**Why:** Supabase mints/refreshes the tokens, so our layer enforces the app-side cap. Using `iat` alone measures token age (~1h with refresh), not session age — so a stable `authTimeClaim` (added via a Supabase Auth Hook) is the correct source for a true absolute cap; we default to `iat` and skip enforcement when no start time exists rather than reject a well-formed token. This keeps the mechanism tenant-configurable per the PRD while being honest about the Supabase interaction.
**Config (user-owned):** optionally add a stable session-start custom claim in Supabase and set `auth_time_claim`; otherwise Supabase's own session time-box/inactivity settings back this up.
**Status:** ✅ Active. 13 tests (timeout math incl. mobile-vs-desktop, resolver rejection) + e2e proving a 9h-old session is rejected on desktop but accepted on mobile.

### D-0014 — Audit log is append-only + hash-chained for tamper-evidence
**What we decided (EP1-S12 skeleton; ABC-4):** The audit log is append-only with two independent tamper-resistance layers: (1) a per-tenant SHA-256 hash chain (`hash = SHA256(prevHash + canonical(event))`) that `verifyIntegrity` recomputes to detect any alteration/deletion/reordering, and (2) a database trigger that blocks `UPDATE`/`DELETE`. `AuditService.record` is the single append API; concrete write-sites are added by their own stories (impersonation #9, tier changes, engagement edits, exports, GOV-1 user/permission changes), and GOV-4 extends this with retention, export and scoped reads.
**Why:** ABC-4 requires the log to *demonstrate* records were not retrospectively altered — that evidentiary property needs cryptographic linkage, not just access control. The hash chain gives detectability even if someone bypasses the trigger (proven in `verify:audit`); the trigger gives plain immutability at the DB. Building it as a skeleton now means every later governance/impersonation story writes to one consistent, verifiable log.
**Deferred to GOV-4:** advisory-lock serialization of concurrent writers (the unique `(tenant_id, seq)` constraint currently fails a racing duplicate rather than corrupting the chain), periodic external anchoring/signing of the chain head, retention config, and read-scoping/RLS.
**Status:** ✅ Active. 6 unit tests + `verify:audit` (append-only trigger blocks UPDATE/DELETE; untampered chain verifies; a row altered behind the trigger is detected).

### D-0013 — Identity attributes resolved by per-tenant precedence (AUTH-2)
**What we decided (AUTH-2):** Role, function and reporting line are resolved at sign-in by combining the SET user record with IdP claims, per a per-tenant `precedence` policy (`tenant_auth_settings`): `record_first` (default) or `idp_first`, with configurable dotted claim paths (e.g. `app_metadata.role`). Role always falls back to the record so a session can never be role-less.
**Why:** The PRD makes precedence tenant-configurable, and this is exactly the mechanism OQ-2 (authoritative org-hierarchy source: HRIS / Entra ID groups / manual) needs — each tenant chooses its source via config rather than us hard-coding one. Defaulting to `record_first` is safe: IdP claims cannot silently escalate a role unless a tenant opts in.
**OQ-2:** the *mechanism* is delivered; the operational default per tenant (and specifically where reporting-line comes from) is still a per-onboarding config choice, not a code blocker.
**Status:** ✅ Active. 13 unit tests (claim precedence matrix, claim extraction) + an e2e proving an `idp_first` role claim elevates permissions end-to-end.

### D-0012 — SSO via Supabase Auth; the app only verifies JWTs
**What we decided (AUTH-1):** Use **Supabase Auth** for the enterprise-SSO handshakes (SAML/OIDC, sessions, MFA); it issues a JWT. Our NestJS app **verifies** that JWT (via the project JWT secret or Supabase JWKS, checking issuer/audience/expiry) and owns the rest: email-domain → tenant routing (`tenant_domains`), user → role/function mapping (`users`), and RBAC. A verified session supersedes the dev `x-*` header seams from earlier stories. Stack context: the project runs on Supabase + Vercel.
**Why:** We are already on Supabase, whose Auth handles SAML/OIDC, session management and MFA as a managed feature — far less auth code to build, secure and maintain than hand-rolling `@node-saml`/`openid-client`, and it fits the "verified session claims" design we already had. `jose` verifies the token (pinned to v5 for its CommonJS build — v6 is ESM-only and Jest could not load it).
**Config (user-owned):** enable SSO providers + domain mapping in the Supabase dashboard; set `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL` (+ optional issuer/audience). See [[infra-supabase-vercel]] — I flag config, the user applies it.
**Status:** ✅ Active. 24 tests (verifier incl. asymmetric JWKS, resolver, session helpers) + a 5-case HTTP e2e proving a real signed token drives tenant + principal + RBAC with no dev headers.

### D-0011 — Deployment mode is config-driven; Unilever runs shared (OQ-1 answered)
**What we decided (TEN-4):** The same codebase serves both a `shared` multi-tenant instance and a `dedicated` single-tenant instance, selected by `DEPLOYMENT_MODE`. A dedicated instance points `DATABASE_URL` / `ANALYTICS_DATABASE_URL` / `MASTER_ENCRYPTION_KEY` at isolated resources and sets `DEDICATED_TENANT_SLUG`; a global `DedicatedTenantGuard` makes it serve only that tenant (404 for any other). Config is validated fail-fast at startup, and `/health` reports mode/region.
**OQ-1 answer (2026-08-10, from the user):** Unilever does **not** require a dedicated instance, and data-residency region does not matter — so **Unilever runs on the shared instance**. The dedicated-instance path is still built because TEN-4 requires it be *available* for future enterprise tenants; it is no longer a Phase-0 blocker.
**Why:** Keeping the difference to configuration (not a code fork) means one codebase, one release pipeline. The tenant guard is defence-in-depth on top of the physical isolation a dedicated instance already has.
**Status:** ✅ Active. 11 unit tests + a 3-case dedicated-instance HTTP e2e.

### D-0010 — RBAC: cumulative role matrix, guard + ambient principal
**What we decided (§4.1):** Four roles (Field, Function Lead, Leadership, Admin) with a cumulative default permission matrix (each role ⊇ the one below). Enforcement is a global NestJS `PermissionsGuard` reading a `@RequirePermissions` decorator; the actor is an ambient `PrincipalContext` (AsyncLocalStorage), set by `PrincipalMiddleware`. Role is assigned per user and decoupled from job title. The permission list was reverse-engineered from the PRD's scattered rules because the §4.1 matrix table did not extract from the DOCX (it was an image).
**Why:** Mirrors the dashboards in §7.7 ("Leadership as Function Lead but org-wide", "Admin = Leadership plus Governance"), so a cumulative matrix is the natural model. An ambient principal + global guard keeps authorization out of call sites, consistent with how TenantContext handles tenancy. Data scope (own/function/org) is modelled as distinct permissions rather than baked into one, so scope stays explicit.
**Seam:** the principal is read from `x-user-*` headers for now — a stand-in for verified SSO claims (AUTH-1/AUTH-2, EP1-S5). These headers are NOT yet a trust boundary; the matrix + guard are the deliverable.
**Status:** ✅ Active. 18 unit tests + a 5-case HTTP e2e (Field forbidden from direct create, Function Lead allowed, 401 unauthenticated, 400 no-tenant).

### D-0009 — Per-tenant encryption via envelope encryption + crypto-shredding
**What we decided (TEN-3):** Free-text is encrypted at rest with AES-256-GCM under a per-tenant Data Encryption Key (DEK). Each DEK is stored wrapped by a master KEK (KMS in production, `MASTER_ENCRYPTION_KEY` env in dev) in `tenant_encryption_keys`. Application-layer encryption via a `TenantFieldCrypto` seam (not Postgres `pgcrypto`). Contractual deletion is **crypto-shredding**: destroying the tenant's wrapped DEK makes all their ciphertext permanently unrecoverable.
**Why:** Per-tenant keys + key-destruction-as-deletion are far cleaner at the application layer than in-database column encryption — one delete of a wrapped key shreds a tenant's data without touching every ciphertext row, and keys never need to reach the database in unwrapped form. AES-256-GCM is authenticated, so wrong-key/tampered reads fail loudly (which is what makes shredding verifiable). The DEK is cached in-process after first unwrap.
**Status:** ✅ Active. Proven by `npm run verify:crypto` (4 checks) + 19 unit tests. EP-3/EP-6 will apply the seam to engagement notes / escalation descriptions.

### D-0008 — Cross-tenant reads via a restricted-role, metadata-only view
**What we decided (TEN-2):** The only cross-tenant read path is a `platform_tenant_metrics` SQL view exposing counts + timestamps + tenant slug (no stakeholder names, no notes), consumed by a separate `PlatformAnalyticsService` on its own connection, excluded from the tenant middleware. The view is read by a dedicated `teasoo_analytics` role that has `SELECT` on the view and **no** privilege on the base tables. The view runs with its owner's rights (owner must bypass RLS — superuser or a `BYPASSRLS` platform role), so it aggregates across tenants while the analytics role itself can never read a base-table row.
**Why:** Makes "no names/notes leave the tenant boundary" a *structural* guarantee (a grant, enforced by the database) rather than a matter of application discipline. Even buggy analytics code physically cannot select a stakeholder name. Cross-tenant joins from the app role remain blocked by the TEN-1 RLS.
**Status:** ✅ Active. Proven by `npm run verify:ten2` (4 checks).

### D-0007 — Test strategy: Jest for units, PGlite script for RLS
**What we decided:** Unit-test the pure/app-layer logic (tenant context, scope function, middleware) with **Jest** in transpile-only mode (`isolatedModules`), with a separate `npm run typecheck` (`tsc --noEmit`) for full type-checking. Prove the database RLS layer with a **standalone script** (`npm run verify:rls`) that runs the real migration SQL against **PGlite** (PostgreSQL 16 in WASM) as a non-superuser role.
**Why:** (1) ts-jest type-checking every generated Prisma type made the suite take ~286s; transpile-only cut it to ~7s, and `tsc --noEmit` still guards types. (2) PGlite loads its WASM via dynamic `import()`, which Jest's sandboxed VM blocks — so the RLS proof runs as a plain Node script instead. (3) PGlite needs no DB server and runs anywhere, and RLS only enforces against a non-superuser role, so the script does `SET ROLE app_user`. A local Postgres install was attempted first but the EDB installer mirror returned 403.
**Status:** ✅ Active. All 18 unit tests + 6 RLS checks pass.

### D-0006 — Tech stack: NestJS + Prisma + PostgreSQL (TypeScript full-stack)
**What we decided:** Build the backend on **NestJS (Node/TypeScript)** with **Prisma** as the ORM and **PostgreSQL** as the database. The tenant-isolation mechanism (TEN-1) is: NestJS middleware resolves the tenant per request and stores it in `AsyncLocalStorage`; a Prisma client extension injects `tenant_id` on every query; PostgreSQL **row-level security (RLS)** is the second line of defence. We build **story by story**, not the whole app at once.
**Why:** One language across front and back (the PWA is expected to be React/TS), so types and validation can be shared. NestJS's middleware/guard/DI model maps directly onto "tenant-scoped by middleware, not developer discipline" (TEN-1). PostgreSQL was effectively already implied — the PRD explicitly requires database RLS as a second line of defence (§5.1), which is a Postgres feature.
**Status:** ✅ Active. Chosen 2026-08-10 at the start of EP1-S1 (issue #2).

### D-0005 — GitHub API calls use BOM-less JSON via `--input` files
**What we decided:** When creating issues/sub-issues through the GitHub CLI, we pass a temp JSON file (`gh api --input file.json`) written as UTF-8 **without** a byte-order mark, rather than passing values as command-line arguments.
**Why:** Two problems bit us on the first run. (1) Titles containing quotes/parentheses (e.g. `Tenant Admin impersonation ("view as")`) broke Windows command-line argument parsing. (2) PowerShell 5.1's `Set-Content -Encoding utf8` adds a BOM, which `gh api` rejects with "Problems parsing JSON". Also, sub-issue links require `sub_issue_id` as a JSON **integer**, not a string. The `--input` + BOM-less approach handles all three cleanly.
**Status:** ✅ Active. Implemented in [github-issues/Create-GithubIssues.ps1](github-issues/Create-GithubIssues.ps1).

### D-0004 — Roll out epics to GitHub one (or two) at a time, with verification
**What we decided:** Create the epics on GitHub incrementally rather than all at once, verifying each epic's sub-issue links landed before moving on.
**Why:** Caught the script bugs early (on EP-1) instead of after generating 115 issues. The creation script is re-run-safe (tracks what it created in `created-mapping.json` and skips duplicates), so staging costs nothing.
**Status:** ✅ Active — completed. All 14 epics + 101 stories are live.

### D-0003 — Epics are GitHub issues; stories are native sub-issues
**What we decided:** Model each epic as a parent GitHub issue and each story as a GitHub issue linked as a **native sub-issue** of its epic (via the sub-issues API). Label everything by type (`epic` / `story`) and by phase.
**Why:** Native sub-issues give a real parent/child hierarchy in the GitHub UI (progress tracking, roll-up) rather than a checklist in the body that drifts out of sync. Phase labels let us later group issues into milestones or a project board.
**Status:** ✅ Active.

### D-0002 — Break the PRD into 14 epics / 101 stories, traced to requirement IDs
**What we decided:** Decompose the PRD into 14 epics and ~101 stories. Every story references its source PRD requirement ID (e.g. `ENG-7`, `REG-3`) in its body.
**Why:** Traceability — anyone can follow a GitHub story back to the exact PRD clause it satisfies, and nothing in the PRD silently drops off the plan. Cross-cutting concerns (non-functional §8, data-protection/anti-bribery §11) are their own epics (EP-11, EP-12) so they can't get buried inside feature work.
**Status:** ✅ Active. Full breakdown in [BACKLOG.md](BACKLOG.md).

### D-0001 — Connect this folder to GitHub via `git init` + remote only
**What we decided:** Initialize this project folder as a git repo and add `https://github.com/Teasoo-Holding/teasoo-set-app` as the `origin` remote — without cloning into a subfolder or pulling remote content.
**Why:** The folder already held the PRD (`teasoo-set-prd.docx`) and we wanted to wire it to the existing repo in place, not disturb the local files or risk a filename collision from a pull.
**Status:** ✅ Active. Nothing has been committed or pushed yet.

---

## Open questions (decisions we still owe)

These come from PRD §11.4 and gate specific work. They are **not decided yet** — listed here so they aren't forgotten. When answered, they become a numbered decision above.

| # | Question | What it blocks | Recommendation in PRD |
|---|---|---|---|
| ~~OQ-1~~ | ~~Does Unilever require a dedicated instance + specific data-residency region?~~ **RESOLVED 2026-08-10 → D-0011:** No, and region does not matter — Unilever runs on the shared instance. | — | — |
| OQ-2 | Authoritative source for the org hierarchy — HRIS, Entra ID groups, or manual? | SSO claim resolution (#7); escalation routing | **Mechanism delivered (D-0013):** per-tenant `precedence` config supports any source. Still open: the default choice per tenant at onboarding. |
| OQ-3 | One Unilever Nigeria entity, or multi-country within one tenant? | Data model — a `business_unit` dimension above function | Cheaper to add now than later |
| OQ-4 | Who holds Superadmin in production? | RBAC config (#10) | A Corporate Affairs ops owner, not the MD |
| OQ-5 | Single-axis or two-axis sentiment model? | Sentiment stories (#38–#40) | Ship single-axis, test in pilot, revisit |
| OQ-6 | Commercial/pricing model — per-seat vs tiered? | Self-serve onboarding plan (EP-13) | Tiered by stakeholder count / org size, unlimited field seats |
| OQ-7 | Do Heads need cross-function read access? | Directory view (#23); Function Lead home (#60) | Read-only cross-function Directory visibility, tested in pilot |
| OQ-8 | Canonical product name — "Teasoo SET" (PRD) vs "Stakeholder Intelligence System / SIS" (prototype)? | All UI copy, branding, the login screen | Pick one before frontend build; PRD uses "Teasoo SET" |
