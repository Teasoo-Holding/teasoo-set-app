/**
 * EP1-S12 — proof of the audit log's tamper-resistance against real Postgres
 * (PGlite). Asserts:
 *   A. the append-only trigger blocks UPDATE and DELETE on audit_events;
 *   B. an untampered chain verifies;
 *   C. bypassing the trigger to alter a row is detected by the hash chain (ABC-4).
 *
 *   npm run verify:audit
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { AuditEventRecord } from '../src/audit/audit-event';
import { AuditStore, ChainHead } from '../src/audit/audit-store';
import { AuditService } from '../src/audit/audit.service';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function loadMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_/.test(name))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

class PgliteAuditStore implements AuditStore {
  constructor(private readonly db: PGlite) {}

  async getHead(tenantId: string): Promise<ChainHead | null> {
    const res = await this.db.query<{ seq: number; hash: string }>(
      `SELECT seq, hash FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`,
      [tenantId],
    );
    return res.rows[0] ?? null;
  }

  async append(e: AuditEventRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_events
        (tenant_id, seq, occurred_at, actor_user_id, action, resource_type, resource_id, metadata, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        e.tenantId,
        e.seq,
        e.occurredAt.toISOString(),
        e.actorUserId ?? null,
        e.action,
        e.resourceType ?? null,
        e.resourceId ?? null,
        JSON.stringify(e.metadata),
        e.prevHash,
        e.hash,
      ],
    );
  }

  async list(tenantId: string): Promise<AuditEventRecord[]> {
    const res = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM audit_events WHERE tenant_id = $1 ORDER BY seq ASC`,
      [tenantId],
    );
    return res.rows.map((r) => ({
      tenantId: r.tenant_id as string,
      seq: Number(r.seq),
      occurredAt: new Date(r.occurred_at as string),
      actorUserId: (r.actor_user_id as string) ?? undefined,
      action: r.action as string,
      resourceType: (r.resource_type as string) ?? undefined,
      resourceId: (r.resource_id as string) ?? undefined,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      prevHash: r.prev_hash as string,
      hash: r.hash as string,
    }));
  }
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

  const store = new PgliteAuditStore(db);
  const audit = new AuditService(store);
  const TENANT = '11111111-1111-1111-1111-111111111111';

  await audit.record({ tenantId: TENANT, action: 'auth.sign_in', occurredAt: new Date('2026-06-01T00:00:00Z') });
  await audit.record({ tenantId: TENANT, action: 'tier.changed', occurredAt: new Date('2026-06-02T00:00:00Z'), metadata: { from: 2, to: 1 } });
  await audit.record({ tenantId: TENANT, action: 'export.created', occurredAt: new Date('2026-06-03T00:00:00Z') });

  // A. append-only: UPDATE and DELETE are refused by the trigger.
  await assertRejects(
    () => db.query(`UPDATE audit_events SET action = 'tampered' WHERE seq = 2`),
    'UPDATE on audit_events must be blocked',
  );
  await assertRejects(
    () => db.query(`DELETE FROM audit_events WHERE seq = 2`),
    'DELETE on audit_events must be blocked',
  );
  checks.push('append-only trigger blocks UPDATE and DELETE');

  // B. the untampered chain verifies.
  {
    const result = await audit.verifyIntegrity(TENANT);
    assert.ok(result.ok, 'untampered chain should verify');
    checks.push('untampered hash chain verifies');
  }

  // C. bypass the trigger to alter a row — the hash chain still catches it.
  await db.exec(`ALTER TABLE audit_events DISABLE TRIGGER audit_events_block_mutate`);
  await db.query(`UPDATE audit_events SET metadata = '{"from":2,"to":3}'::jsonb WHERE tenant_id = $1 AND seq = 2`, [TENANT]);
  await db.exec(`ALTER TABLE audit_events ENABLE TRIGGER audit_events_block_mutate`);
  {
    const result = await audit.verifyIntegrity(TENANT);
    assert.equal(result.ok, false, 'tampered chain must fail verification');
    assert.equal(result.brokenAtSeq, 2, 'tamper detected at the altered event');
    checks.push('hash chain detects a row altered behind the trigger (ABC-4)');
  }

  await db.close();
  console.log('EP1-S12 audit log verified:');
  for (const c of checks) console.log(`  ✓ ${c}`);
}

main().catch((err) => {
  console.error('Audit verification FAILED:', err.message);
  process.exit(1);
});
