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
| OQ-1 | Does Unilever require a dedicated instance + specific data-residency region? | Phase 0 architecture; story #5 (dedicated-instance path) | Assess at contract stage; answer before build starts |
| OQ-2 | Authoritative source for the org hierarchy — HRIS, Entra ID groups, or manual? | SSO claim resolution (#7); escalation routing | — |
| OQ-3 | One Unilever Nigeria entity, or multi-country within one tenant? | Data model — a `business_unit` dimension above function | Cheaper to add now than later |
| OQ-4 | Who holds Superadmin in production? | RBAC config (#10) | A Corporate Affairs ops owner, not the MD |
| OQ-5 | Single-axis or two-axis sentiment model? | Sentiment stories (#38–#40) | Ship single-axis, test in pilot, revisit |
| OQ-6 | Commercial/pricing model — per-seat vs tiered? | Self-serve onboarding plan (EP-13) | Tiered by stakeholder count / org size, unlimited field seats |
| OQ-7 | Do Heads need cross-function read access? | Directory view (#23); Function Lead home (#60) | Read-only cross-function Directory visibility, tested in pilot |
| OQ-8 | Canonical product name — "Teasoo SET" (PRD) vs "Stakeholder Intelligence System / SIS" (prototype)? | All UI copy, branding, the login screen | Pick one before frontend build; PRD uses "Teasoo SET" |
