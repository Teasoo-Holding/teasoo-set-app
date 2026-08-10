# Teasoo SET — Epics & Stories

Derived from `teasoo-set-prd.docx`. Story IDs trace back to PRD requirement IDs (e.g. `ENG-7`) so acceptance criteria stay anchored to the source doc. Phase tags map to PRD §10 Release Plan.

## Epic index

| Epic | Name | Primary phase | PRD ref |
|---|---|---|---|
| EP-1 | Tenancy & access foundations | Phase 0 | §5, §7.1 |
| EP-2 | Stakeholder registry | Phase 1 | §7.2 |
| EP-3 | Engagement logging (critical path) | Phase 1 | §7.3 |
| EP-4 | Sentiment, risk & trend | Phase 1–2 | §7.4 |
| EP-5 | Commitments | Phase 1 | §7.5 |
| EP-6 | Escalations | Phase 1 | §7.6 |
| EP-7 | Role dashboards | Phase 1 | §7.7 |
| EP-8 | Governance & admin | Phase 1–2 | §7.8 |
| EP-9 | Notifications | Phase 1–2 | §7.9 |
| EP-10 | Mobile & offline | Phase 1–2 | §7.10 |
| EP-11 | Non-functional / platform quality | Cross-cutting | §8 |
| EP-12 | Data protection & anti-bribery compliance | Cross-cutting, starts Phase 0 | §11.2, §11.3 |
| EP-13 | Multi-tenant self-serve onboarding | Phase 3 | §5.3 |
| EP-14 | Phase 4 candidates (parking lot) | Not scheduled | §10 |

Open questions in PRD §11.4 gate specific epics — flagged inline below where relevant.

---

## Parking lot — discussed but not yet scheduled

**What this is:** anything we talk about and decide *not* to build right now lands here so it isn't lost. Each item has a date and a one-line note on where it came from. When an item graduates into committed work, it becomes a GitHub issue (and gets removed from this list). Decisions about *how* we build go in [DECISIONS.md](DECISIONS.md); this list is for *work we might do later*.

_(Nothing parked yet — this section fills up as we go.)_

| Added | Item | Context / why parked |
|---|---|---|
| — | — | — |

---

## EP-1. Tenancy & access foundations
**Goal:** every other epic depends on a correctly isolated, authenticated tenant shell. Nothing in Phase 1 can start safely until this exists.

- **EP1-S1 — Tenant-scoped data access middleware** (`TEN-1`): all query paths are tenant-scoped by middleware, not developer discipline; row-level security in the database as second line of defence.
- **EP1-S2 — Cross-tenant isolation guarantee** (`TEN-2`): no cross-tenant join possible in application code; platform analytics reads only a metadata-only projection (counts/timestamps, no names/notes).
- **EP1-S3 — Per-tenant encryption for free text** (`TEN-3`): engagement notes and escalation descriptions encrypted at rest with per-tenant keys; key destruction implements contractual deletion.
- **EP1-S4 — Dedicated-instance deployment path** (`TEN-4`): same codebase, separate DB/key store, deployable for enterprise tenants. *Blocked on open question: does Unilever require dedicated instance + data residency region (§11.4)? Must be answered before this is built, not just designed.*
- **EP1-S5 — Enterprise SSO sign-in** (`AUTH-1`): SAML 2.0 and OIDC; email-domain routing resolves tenant.
- **EP1-S6 — Role/function/reporting-line resolution from IdP** (`AUTH-2`): tenant-configurable precedence between IdP claims and SET's own user record. *Depends on open question: authoritative org-hierarchy source — HRIS, Entra ID groups, or manual (§11.4).*
- **EP1-S7 — Demo/sandbox mode** (`AUTH-3`): pre-seeded personas, watermarked, structurally incapable of holding production data.
- **EP1-S8 — Configurable session timeout** (`AUTH-4`): per-tenant, default 12h mobile / 8h desktop.
- **EP1-S9 — Tenant Admin impersonation ("view as")** (`AUTH-5`): read-only, banner-flagged, writes to audit log.
- **EP1-S10 — RBAC permission matrix** (§4.1): role model decoupled from job title, configurable per tenant; enforce Field / Function Lead / Leadership / Admin permission boundaries.
- **EP1-S11 — Escalation visibility rule** (§4.1 note): escalation raised in a function is visible to that Function Lead *and* Leadership simultaneously — does not queue behind the Head.
- **EP1-S12 — Audit log skeleton**: foundational event log (auth, permission changes) that EP-8's full audit log (`GOV-4`) extends.

---

## EP-2. Stakeholder registry
**Goal:** a clean, deduplicated, permissioned directory of stakeholder organizations — the spine everything else hangs off.

- **EP2-S1 — Core stakeholder record** (`REG-1`): name, type, function, tier, assigned owner, status (active/dormant/archived), current sentiment, risk flag, description.
- **EP2-S2 — Tenant-configurable tiers & cadence** (`REG-2`): default 3-tier model with cadence (Tier 1 monthly, Tier 2 quarterly, Tier 3 as-needed) and escalation-routing implications; tier count/definitions editable per tenant.
- **EP2-S3 — Tier change approval workflow** (`REG-2`): Leadership/Admin approval required, audit-logged.
- **EP2-S4 — Fuzzy-match dedupe warning at creation** (`REG-3`): shows possible existing matches before a new stakeholder is created.
- **EP2-S5 — Alias field** (`REG-3`): every stakeholder record supports aliases (e.g. "NAFDAC" / "N.A.F.D.A.C.").
- **EP2-S6 — Admin merge tool** (`REG-3`): merges duplicate records while preserving both records' engagement history.
- **EP2-S7 — Request-a-stakeholder workflow** (`REG-4`): field user submits request (name, type, why, proposed function) → routes to Function Lead/Admin with dedupe candidates shown to approver; 2-working-day SLA target; requester notified; auto-assigned to requester on approval unless reassigned.
- **EP2-S8 — Directory search & filter** (`REG-5`): by function, type, tier, sentiment, risk flag, owner, last-engagement recency; Leadership's "Activity by function" table filters Directory on click.
- **EP2-S9 — Field-user reduced directory view** (`REG-5`): field users see existence + owner, not engagement notes.
- **EP2-S10 — Coverage-gap ("going cold") detection** (`REG-6`): flags any stakeholder with no engagement logged within its tier's expected cadence, surfaced on owner's and Head's dashboards.

---

## EP-3. Engagement logging (critical path)
**Goal:** capture a meeting in under 60 seconds. This is the epic the product lives or dies on — treat the 60s figure as a hard performance budget for every story below, not an aspiration.

- **EP3-S1 — One-tap log entry** (`ENG-1`): reachable from field user's home screen at all times.
- **EP3-S2 — Minimum viable log** (`ENG-2`): stakeholder, date, channel, sentiment, one-line summary — five fields, everything else optional.
- **EP3-S3 — Aggressive smart defaults** (`ENG-3`): date=today; stakeholder=most-recently-engaged or nearest-by-geolocation if enabled; channel=last used; logger=current user.
- **EP3-S4 — Tap-target sentiment capture** (`ENG-4`): three large tap targets on tenant's sentiment scale, not a dropdown.
- **EP3-S5 — Voice-to-text on summary field** (`ENG-5`).
- **EP3-S6 — Progressive disclosure of optional fields** (`ENG-6`): attendees, topics/tags, attachments, next-step commitment, escalate-this toggle.
- **EP3-S7 — Offline-first capture** (`ENG-7`): draft persists locally, syncs on reconnect, clear pending state. Non-negotiable — treat as launch blocker for field rollout, not a nice-to-have.
- **EP3-S8 — Draft auto-save** (`ENG-8`): interrupted log is never lost.
- **EP3-S9 — Edit window & append-only correction history** (`ENG-9`): logger can edit own engagement for 24h; after that, edits are visible append-only corrections (evidentiary integrity).
- **EP3-S10 — Inline commitment creation** (`ENG-10`): created from engagement, inherits stakeholder, owner defaults to logger, due-date picker with common relative options.
- **EP3-S11 — Log-on-behalf-of with notification** (`ENG-11`): Head+ can log an engagement on a stakeholder they don't own; owner is notified. Prevents silent parallel engagement.

---

## EP-4. Sentiment, risk & trend
**Goal:** turn individually-logged engagements into portfolio-level, explainable risk visibility for leadership.

- **EP4-S1 — Per-engagement sentiment assertion** (`RISK-1`): stakeholder's current sentiment = sentiment of most recent engagement.
- **EP4-S2 — Portfolio sentiment trend chart** (`RISK-2`): monthly aggregate with Improving/Stable/Declining label; in-product info affordance documenting the formula. Default weighting: tier-weighted mean, Tier 1×3, Tier 2×2, Tier 3×1.
- **EP4-S3 — Current sentiment mix panel** (`RISK-3`): percentage split across sentiment values for the visible (role-scoped) portfolio.
- **EP4-S4 — High-risk flag engine** (`RISK-4`): tenant-configurable rules; defaults = Resistant sentiment on Tier 1/2, sentiment declined 2 steps in 60 days, open escalation exists, overdue High-priority commitment exists, Tier 1 with no engagement in 60 days.
- **EP4-S5 — Explainable flags** (`RISK-5`): hover/tap a risk indicator states which rule fired — no black-box scoring.
- **EP4-S6 — Trend baseline guard** (`RISK-6`): requires ≥3 months history before showing a trend; shows an honest "building baseline" state before that.

---

## EP-5. Commitments
**Goal:** track promises in both directions — what the company owes the stakeholder, and what the stakeholder owes the company.

- **EP5-S1 — Commitment record** (`COM-1`): stakeholder, description, internal owner, due date, priority, state (open/done/dropped with reason on drop).
- **EP5-S2 — Field-user "my open commitments" view** (`COM-2`): own open commitments only, sorted by due date, on home screen.
- **EP5-S3 — Head/Leadership commitments-in-scope view** (`COM-3`): all commitments in scope with owner attribution + "due this week" count.
- **EP5-S4 — Reminders** (`COM-4`): T-3 days and due-date, via tenant-configured channel (email + in-app minimum for v1).
- **EP5-S5 — Overdue escalation visibility** (`COM-5`): escalates to Head at +3 days, to Leadership at +10 days on Tier 1 stakeholders.
- **EP5-S6 — Bidirectional commitments** (`COM-6`): commitments made *by* the stakeholder to the company, distinguished by direction.

---

## EP-6. Escalations
**Goal:** surface problems immediately to the people who can act, without a game of telephone.

- **EP6-S1 — Raise escalation** (`ESC-1`): from an engagement or directly from a stakeholder, any user.
- **EP6-S2 — Escalation record** (`ESC-2`): reason, severity, requested intervention, raised-by, timestamp.
- **EP6-S3 — Escalation board** (`ESC-3`): ordered by severity then tier; shows stakeholder, tier badge, one-line reason, risk and sentiment chips.
- **EP6-S4 — Immediate dual visibility + nav badge counts** (`ESC-4`): visible to relevant Function Lead and Leadership simultaneously.
- **EP6-S5 — Resolution workflow** (`ESC-5`): requires resolution note, closes with timestamped record; history retained on the stakeholder permanently.
- **EP6-S6 — Ageing indicator** (`ESC-6`): escalations open >7 days visually distinguished.

---

## EP-7. Role dashboards
**Goal:** each role sees exactly what it needs and nothing else — this is a functional requirement, not visual polish.

- **EP7-S1 — Field home** (§7.7): greeting, date, primary Log Engagement CTA, my-stakeholder count, request-a-stakeholder shortcut, my open commitments. Nothing else — answers exactly one question.
- **EP7-S2 — Function Lead home** (§7.7): function badge, escalation count in greeting, four KPI tiles (high risk / open escalations / commitments due this week / supportive %), portfolio sentiment trend + mix, team panel (direct reports with stakeholder counts + open escalations), escalation board, upcoming commitments with owners, recent Tier 1 activity feed.
- **EP7-S3 — Leadership home** (§7.7): as Function Lead, org-wide; function badge replaced by Activity-by-function table (function, stakeholder count, high-risk count, escalation count, click-to-filter Directory); team panel replaced by cross-function rollup.
- **EP7-S4 — Admin home** (§7.7): Leadership view + Governance access.
- **EP7-S5 — Activity feed** (§7.7): chronological cross-portfolio stream, badge-counted, role-scoped; Recent Tier 1 activity is a filtered view of the same stream.
- **EP7-S6 — Progressive navigation by role** (§6.1): field user sees 3 nav items, admin sees 5 — deliberately near-empty for field, not a placeholder state.

---

## EP-8. Governance & admin
**Goal:** give admins the tools to keep the registry clean and the system accountable, without engineering involvement.

- **EP8-S1 — User management** (`GOV-1`): invite, deactivate, role assignment, function assignment, reporting-line maintenance.
- **EP8-S2 — Taxonomy management** (`GOV-2`): functions, stakeholder types, tier definitions/cadences, sentiment labels, commitment priorities, risk-rule thresholds — all tenant-editable.
- **EP8-S3 — Registry hygiene queue** (`GOV-3`): pending stakeholder requests, duplicate candidates, unassigned stakeholders, stakeholders with deactivated owners, records going cold.
- **EP8-S4 — Immutable audit log** (`GOV-4`): covers auth, permission changes, tier changes, engagement creation/edits, escalation state changes, merges, exports, impersonation sessions; exportable; retention configurable, default 7 years.
- **EP8-S5 — Scoped export** (`GOV-5`): CSV/XLSX of stakeholders, engagements, commitments, escalations, scoped to requester's permissions, every export audit-logged.
- **EP8-S6 — Offboarding reassignment queue** (`GOV-6`): deactivated user's stakeholders enter a mandatory reassignment queue — cannot be orphaned. This is the mechanism behind the core "relationship equity doesn't walk out the door" promise.

---

## EP-9. Notifications
**Goal:** the right nudge, on the right channel, without becoming noise.

- **EP9-S1 — Per-user notification toggles** (§7.9): all notification types individually toggleable per user.
- **EP9-S2 — Admin-only escalation notification control** (§7.9): escalation notifications toggleable only by Admin (can't be silenced by an individual).
- **EP9-S3 — Commitment reminders** (`COM-4`, shared with EP-5): T-3 and due-date reminders via tenant's configured channel.
- **EP9-S4 — Owner notification on log-on-behalf-of** (`ENG-11`, shared with EP-3).
- **EP9-S5 — v1.1 candidate channels** (`COM-4`): Teams and WhatsApp Business — flag as fast-follow given field-user reality in this market, not v1 scope.

---

## EP-10. Mobile & offline
**Goal:** the field experience has to work on a phone, on 3G, in a car park.

- **EP10-S1 — Responsive web + installable PWA** (`MOB-1`): v1 delivery mechanism, offline capture.
- **EP10-S2 — Mobile-first field / desktop-first leadership** (`MOB-2`): explicit design direction split by role.
- **EP10-S3 — Offline coverage** (`MOB-3`): viewing my stakeholders, viewing my commitments, creating an engagement, creating a commitment — all work offline; sync on reconnect with conflict surfacing.
- **EP10-S4 — 3G performance budget** (`MOB-4`): interactive within 3s, log screen within 1s of tap.
- **EP10-S5 — Native app decision gate** (`MOB-5`): v2 decision, contingent on PWA offline reliability and push notifications proving sufficient in the Unilever pilot — not a story to build yet, a decision checkpoint.

---

## EP-11. Non-functional / platform quality
**Goal:** the operational guarantees that make this deployable to an enterprise tenant. Cross-cutting — apply to every epic above rather than shipping as a separate feature.

- **EP11-S1 — Performance budgets** (§8): p95 dashboard <2s broadband / <4s on 3G; engagement submit acknowledged <500ms via optimistic UI + background sync.
- **EP11-S2 — Availability targets** (§8): 99.5% monthly uptime v1, 99.9% once a second enterprise tenant is live; planned maintenance windows outside 06:00–20:00 tenant-local.
- **EP11-S3 — Scale design targets** (§8): 500 tenants, 50,000 users, 5,000 stakeholders and 100,000 engagements per tenant — single well-indexed relational DB, explicitly do not over-engineer beyond this.
- **EP11-S4 — Security baseline** (§8): TLS 1.3 in transit, AES-256 at rest with per-tenant keys for free text (ties to `TEN-3`), encrypted tested backups, RPO 1h / RTO 4h, annual pentest, SOC 2 Type II on roadmap.
- **EP11-S5 — Accessibility** (§8): WCAG 2.2 AA; specifically fix sentiment/risk color-only encoding (needs shape/label reinforcement) and add an accessible tabular alternative to the sentiment trend bar chart.
- **EP11-S6 — Localization scaffolding** (§8): full i18n scaffolding from day one even though v1 ships en-GB only; date/number/timezone formatting per tenant locale.
- **EP11-S7 — Browser/OS support matrix** (§8): evergreen Chrome/Edge/Safari/Firefox; iOS 16+ and Android 10+ mobile browsers.

---

## EP-12. Data protection & anti-bribery compliance
**Goal:** the product's subject matter — tracking engagement with regulators and officials in a high-risk jurisdiction — makes this epic load-bearing, not a checkbox. Start in Phase 0/1, not bolted on later.

- **EP12-S1 — Design to NDPA + GDPR-grade standard** (`DP-1`): Nigeria Data Protection Act 2023 applies to Unilever Nigeria; design to the stricter GDPR standard given likely global requirement.
- **EP12-S2 — Contact retention schedule** (`DP-2`): documented lawful basis + retention (recommend 24 months post-last-engagement for individuals; organization-level history retained longer).
- **EP12-S3 — Subject access & erasure workflow** (`DP-3`): locate and redact personal data about a named individual without destroying organizational engagement history.
- **EP12-S4 — Notes-discipline guidance** (`DP-4`): in-field guidance text + mandatory training element ("record what was discussed and agreed; avoid speculation about individuals").
- **EP12-S5 — Special-category data guard** (`DP-5`): no storage of health/religion/political/ethnicity data on contacts; consider automated warning on entry of likely special-category terms.
- **EP12-S6 — No free-text bribery path** (`ABC-1`): never provide a free-text field where recording an improper payment is the path of least resistance; if gifts/hospitality are tracked, build a structured register with value thresholds and approval routing, or omit entirely and link to tenant's existing compliance system — no half-version.
- **EP12-S7 — Legal & Compliance pilot involvement** (`ABC-2`): process/stakeholder requirement — Legal & Compliance function lead included in rollout design, not just as a recipient.
- **EP12-S8 — Compliance-concern escalation category** (`ABC-3`): escalation reason routes directly to Legal, bypassing normal function hierarchy.
- **EP12-S9 — Tamper-evident audit trail** (`ABC-4`): audit log sufficient to demonstrate notes were not retrospectively altered (ties to `GOV-4`) — the property that gives the record evidentiary weight.

---

## EP-13. Multi-tenant self-serve onboarding
**Goal:** a second tenant can be onboarded without engineering involvement — this is what makes the product a platform rather than a bespoke Unilever build.

- **EP13-S1 — Platform admin tenant creation** (§5.3): create tenant, set plan and residency, issue tenant-admin invite.
- **EP13-S2 — Guided tenant admin setup** (§5.3): branding, SSO connection, functions, stakeholder types, tier definitions, sentiment labels.
- **EP13-S3 — Bulk import tooling** (§5.3): CSV/SCIM user import; CSV stakeholder import with dedupe preview (reuses `REG-3` dedupe logic).
- **EP13-S4 — Phased function activation** (§5.3): pilot function activated first, remaining functions enabled in sequence.
- **EP13-S5 — Onboarding SLA target**: 10 working days from contract to first live engagement logged — treat as the acceptance metric for this whole epic.

---

## EP-14. Phase 4 candidates (parking lot — not scheduled)
Explicitly deferred per PRD §10, contingent on pilot evidence. Do not pull into earlier phases without a deliberate re-prioritization decision:

- NLP-assisted sentiment suggestion from engagement notes
- Teams and WhatsApp Business logging channels
- Calendar integration to prompt logging after external meetings
- Stakeholder influence-network mapping
- Board-pack report generation
- Native mobile apps
- Gifts-and-hospitality register (§11.3 — only if built as the structured register described in `ABC-1`)

---

## Open questions blocking specific epics (PRD §11.4)

| Question | Blocks |
|---|---|
| Does Unilever require a dedicated instance and specific data residency region? | EP1-S4 (architecture decision must land before Phase 0 build starts) |
| Authoritative source for org hierarchy (HRIS / Entra ID / manual)? | EP1-S6, reporting-line-dependent escalation routing |
| Single Unilever Nigeria entity, or multi-country within one tenant? | Data model — a `business_unit` dimension above function is cheap now, expensive later |
| Who holds Superadmin in production? | EP1-S10 role config (prototype defaults to MD; recommendation is a Corporate Affairs ops owner) |
| Single-axis vs two-axis sentiment model? | EP4-S1..S3 — recommend shipping single-axis, testing in pilot |
| Commercial/pricing model (per-seat vs tiered)? | Not a build blocker, but affects EP13 self-serve plan design |
| Do Heads need cross-function read access? | EP2-S9, EP7-S2 — recommend read-only cross-function Directory visibility for Heads, tested in pilot |
