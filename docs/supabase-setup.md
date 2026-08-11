# Supabase setup

How to connect Teasoo SET to a Supabase Postgres database. Steps marked
**👤 You** are done in the Supabase dashboard / your local `.env`; steps marked
**🤖 Claude** are things Claude runs from the workspace once your `.env` is set.

> **Never paste connection strings or passwords into chat** — they contain the DB
> password. Put them in your local `.env` file (which is gitignored).

Why two roles / two URLs? Supabase's built-in `postgres` role can bypass
row-level security, which would silently switch off our tenant isolation
(TEN-1). So the **app** connects as a dedicated non-superuser role (`teasoo_app`),
while **migrations** run as `postgres` (which has the DDL rights to create
tables, roles and triggers).

---

## 1. 👤 Create the project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it (e.g. `teasoo-set`), set a **database password** (save it), pick any
   region (residency is unconstrained per OQ-1). Free tier is fine to start.
3. Wait for it to provision.

## 2. 👤 Copy the connection strings

In the dashboard: **Project Settings → Database → Connection string** (or the
**Connect** button top-right).

- **Direct connection** (host `db.<ref>.supabase.co`, port **5432**) — for migrations.
- **Transaction pooler** (host `...pooler.supabase.com`, port **6543**) — for the app.

## 3. 👤 Set `DIRECT_URL` in `.env`

Edit `.env` in the project root and set **`DIRECT_URL`** to the **direct**
connection string (role `postgres`, port 5432), with your DB password. Leave
`DATABASE_URL` as-is for the moment. Tell Claude when done.

## 4. 🤖 Run the migrations

Claude runs:

```bash
npm run prisma:migrate
```

This applies migrations `0001`–`0008` to your Supabase database (tables, RLS,
the metadata view, the audit trigger, and the `teasoo_analytics` role). Claude
confirms the tables exist.

## 5. 👤 Create the app roles

In the dashboard: **SQL Editor → New query**. Paste the contents of
[`scripts/supabase-bootstrap.sql`](../scripts/supabase-bootstrap.sql), replace
the two `REPLACE_WITH_..._PASSWORD` placeholders with strong passwords (save
them), and **Run**. This creates `teasoo_app` and gives `teasoo_analytics` a
login — neither with `BYPASSRLS`.

## 6. 👤 Point the app at `teasoo_app`

Back in `.env`, set:
- **`DATABASE_URL`** → the **pooled** connection string, but swap the username to
  `teasoo_app` and use the app password from step 5.
- **`ANALYTICS_DATABASE_URL`** → the pooled connection as `teasoo_analytics`.

(The exact pooled username format is shown in the dashboard's connection panel —
copy it and swap the role name.)

## 7. 🤖 Verify

Claude restarts the server and checks it connects (no more "could not connect"
warning), and can seed/read a tenant.

---

## Auth (SSO) — later

For real enterprise SSO you'll also configure Supabase Auth (**Authentication →
Sign In / Providers / SSO**) and set `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL`
(see [`.env.example`](../.env.example)). SAML SSO is a paid-plan feature. For
local testing before that, Claude can mint test JWTs with the JWT secret from
**Project Settings → API → JWT Settings**. This isn't needed to get the database
working.

## Deploying to Vercel — later

When we deploy, the same env vars go into the Vercel project settings, and the
app uses the **pooled** `DATABASE_URL` (serverless-friendly). Not needed for
local dev.
