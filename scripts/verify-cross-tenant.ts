/**
 * EP1-S2 / TEN-2 — proof of cross-tenant isolation.
 *
 * Runs the real migrations against PGlite (PostgreSQL 16 in WASM) and asserts:
 *   A. the analytics role can read per-tenant metadata across ALL tenants via
 *      the view;
 *   B. the analytics role CANNOT read the base tables (so never names/notes);
 *   C. the projection exposes only metadata columns — no stakeholder name;
 *   D. a cross-tenant JOIN issued from the app role returns nothing (RLS).
 *
 *   npm run verify:ten2
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function loadMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_/.test(name))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

async function assertRejects(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`Expected failure but call succeeded: ${message}`);
}

async function main() {
  const db = new PGlite();
  const checks: string[] = [];

  for (const sql of loadMigrations()) await db.exec(sql);

  // The app role (the analytics role comes from migration 0002).
  await db.exec(`
    CREATE ROLE app_user NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON stakeholders TO app_user;
    GRANT SELECT, INSERT ON tenants TO app_user;
  `);

  const acme = (
    await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('acme','Acme') RETURNING id`)
  ).rows[0].id;
  await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('globex','Globex') RETURNING id`);
  await db.query(`INSERT INTO stakeholders(tenant_id,name) VALUES ($1,'NAFDAC'),($1,'Customs')`, [acme]);
  const globex = (await db.query<{ id: string }>(`SELECT id FROM tenants WHERE slug='globex'`)).rows[0].id;
  await db.query(`INSERT INTO stakeholders(tenant_id,name) VALUES ($1,'FDA')`, [globex]);

  // A. analytics role reads cross-tenant metadata through the view.
  await db.exec(`SET ROLE teasoo_analytics`);
  {
    const rows = await db.query<{ slug: string; stakeholder_count: number }>(
      `SELECT slug, stakeholder_count FROM platform_tenant_metrics ORDER BY slug`,
    );
    assert.deepEqual(rows.rows, [
      { slug: 'acme', stakeholder_count: 2 },
      { slug: 'globex', stakeholder_count: 1 },
    ]);
    checks.push('analytics role sees per-tenant counts across all tenants');
  }

  // B. analytics role cannot read the base tables at all.
  await assertRejects(
    () => db.query(`SELECT name FROM stakeholders`),
    'analytics role blocked from stakeholders base table',
  );
  await assertRejects(
    () => db.query(`SELECT name FROM tenants`),
    'analytics role blocked from tenants base table',
  );
  checks.push('analytics role cannot read the base tables (no names/notes)');
  await db.exec(`RESET ROLE`);

  // C. the projection exposes no stakeholder name / notes column.
  {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'platform_tenant_metrics'`,
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    assert.ok(!names.includes('name'), 'view must not expose a stakeholder name column');
    assert.deepEqual(names, [
      'last_stakeholder_at',
      'slug',
      'stakeholder_count',
      'tenant_created_at',
      'tenant_id',
    ]);
    checks.push(`projection is metadata-only: ${names.join(', ')}`);
  }

  // D. a cross-tenant join from the app role is neutralised by RLS.
  await db.exec(`SET ROLE app_user`);
  await db.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [acme]);
  {
    const joined = await db.query(
      `SELECT a.name AS a, b.name AS b
       FROM stakeholders a JOIN stakeholders b ON a.tenant_id <> b.tenant_id`,
    );
    assert.equal(joined.rows.length, 0, 'cross-tenant join returns nothing under RLS');
    checks.push('cross-tenant join from app code returns nothing (RLS)');
  }
  await db.exec(`RESET ROLE`);
  await db.close();

  console.log('TEN-2 cross-tenant isolation verified:');
  for (const c of checks) console.log(`  ✓ ${c}`);
}

main().catch((err) => {
  console.error('TEN-2 verification FAILED:', err.message);
  process.exit(1);
});
