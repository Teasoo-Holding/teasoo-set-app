/**
 * EP1-S1 / TEN-1 — proof of the database second line of defence.
 *
 * Runs the real migration SQL against PGlite (PostgreSQL 16 in WASM) and asserts
 * that row-level security isolates tenants. Run as a standalone script rather
 * than under Jest because PGlite loads its WASM bundle via dynamic import, which
 * Jest's sandboxed VM blocks.
 *
 *   npm run verify:rls
 *
 * Exits non-zero on the first failed assertion.
 *
 * The crucial detail: RLS is bypassed by superusers, and PGlite connects as one.
 * So we create an ordinary role (`app_user`) — the kind the application actually
 * connects as — and SET ROLE to it. That is the only configuration in which
 * these policies mean anything.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', 'prisma', 'migrations', '0001_init_tenant_rls', 'migration.sql'),
  'utf8',
);

async function main() {
  const db = new PGlite();
  const checks: string[] = [];
  const asTenant = (tenantId: string | null) =>
    db.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);

  await db.exec(MIGRATION_SQL);
  await db.exec(`
    CREATE ROLE app_user NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON stakeholders TO app_user;
    GRANT SELECT, INSERT ON tenants TO app_user;
  `);

  // Seed two tenants as the superuser (RLS bypassed).
  const acme = (
    await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('acme','Acme') RETURNING id`)
  ).rows[0].id;
  const globex = (
    await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('globex','Globex') RETURNING id`)
  ).rows[0].id;
  await db.query(`INSERT INTO stakeholders(tenant_id,name) VALUES ($1,'NAFDAC'),($1,'Customs')`, [acme]);
  await db.query(`INSERT INTO stakeholders(tenant_id,name) VALUES ($1,'FDA')`, [globex]);

  // Everything below runs as the non-superuser app role.
  await db.exec(`SET ROLE app_user`);

  // 1. Fail-closed: no tenant set => no rows.
  await asTenant(null);
  {
    const rows = await db.query(`SELECT name FROM stakeholders`);
    assert.equal(rows.rows.length, 0, 'unset tenant should see zero rows');
    checks.push('fail-closed: unset tenant sees no rows');
  }

  // 2. Each tenant sees only its own rows.
  await asTenant(acme);
  {
    const rows = await db.query<{ name: string }>(`SELECT name FROM stakeholders ORDER BY name`);
    assert.deepEqual(rows.rows.map((r) => r.name), ['Customs', 'NAFDAC'], 'acme sees only its rows');
    checks.push('acme sees only Customs, NAFDAC');
  }
  await asTenant(globex);
  {
    const rows = await db.query<{ name: string }>(`SELECT name FROM stakeholders ORDER BY name`);
    assert.deepEqual(rows.rows.map((r) => r.name), ['FDA'], 'globex sees only its rows');
    checks.push('globex sees only FDA');
  }

  // 3. Cannot read another tenant even by filtering for its id directly.
  {
    const leaked = await db.query(`SELECT name FROM stakeholders WHERE tenant_id = $1`, [acme]);
    assert.equal(leaked.rows.length, 0, 'explicit cross-tenant filter still returns nothing');
    checks.push('cross-tenant filter returns nothing');
  }

  // 4. Cannot write a row for another tenant (WITH CHECK).
  await assertRejects(
    () => db.query(`INSERT INTO stakeholders(tenant_id,name) VALUES ($1,'smuggled')`, [acme]),
    'cross-tenant insert blocked by WITH CHECK',
  );
  checks.push('cross-tenant insert blocked');

  // 5. Cannot reassign an own row to another tenant.
  await asTenant(acme);
  await assertRejects(
    () => db.query(`UPDATE stakeholders SET tenant_id = $1 WHERE name = 'NAFDAC'`, [globex]),
    'reassigning a row to another tenant blocked',
  );
  checks.push('cross-tenant reassignment blocked');

  await db.exec(`RESET ROLE`);
  await db.close();

  console.log('TEN-1 row-level security verified:');
  for (const c of checks) console.log(`  ✓ ${c}`);
}

async function assertRejects(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`Expected failure but call succeeded: ${message}`);
}

main().catch((err) => {
  console.error('TEN-1 verification FAILED:', err.message);
  process.exit(1);
});
