import { canonicalize, GENESIS_HASH } from './audit-event';
import { InMemoryAuditStore } from './audit-store';
import { AuditService } from './audit.service';

const TENANT = 'acme';
const at = (n: number) => new Date(`2026-06-0${n}T00:00:00.000Z`);

describe('canonicalize', () => {
  it('is stable regardless of key order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('distinguishes different content', () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });
});

describe('AuditService', () => {
  let store: InMemoryAuditStore;
  let audit: AuditService;

  beforeEach(() => {
    store = new InMemoryAuditStore();
    audit = new AuditService(store);
  });

  it('chains events: seq increments and prevHash links', async () => {
    const e1 = await audit.record({ tenantId: TENANT, action: 'auth.sign_in', occurredAt: at(1) });
    const e2 = await audit.record({ tenantId: TENANT, action: 'tier.changed', occurredAt: at(2) });
    expect(e1.seq).toBe(1);
    expect(e1.prevHash).toBe(GENESIS_HASH);
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
  });

  it('keeps separate chains per tenant', async () => {
    await audit.record({ tenantId: 'acme', action: 'x', occurredAt: at(1) });
    const other = await audit.record({ tenantId: 'globex', action: 'y', occurredAt: at(1) });
    expect(other.seq).toBe(1);
    expect(other.prevHash).toBe(GENESIS_HASH);
  });

  it('verifies an untampered chain', async () => {
    await audit.record({ tenantId: TENANT, action: 'a', occurredAt: at(1) });
    await audit.record({ tenantId: TENANT, action: 'b', occurredAt: at(2), metadata: { k: 'v' } });
    await audit.record({ tenantId: TENANT, action: 'c', occurredAt: at(3) });
    expect(await audit.verifyIntegrity(TENANT)).toEqual({ ok: true });
  });

  it('detects a retrospectively altered event', async () => {
    await audit.record({ tenantId: TENANT, action: 'a', occurredAt: at(1) });
    await audit.record({ tenantId: TENANT, action: 'b', occurredAt: at(2), metadata: { amount: 1 } });
    await audit.record({ tenantId: TENANT, action: 'c', occurredAt: at(3) });

    store.tamperMetadata(TENANT, 2, { amount: 999 });

    const result = await audit.verifyIntegrity(TENANT);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });
});
