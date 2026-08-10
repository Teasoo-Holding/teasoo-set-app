import { applyTenantScope, isTenantScoped } from './tenant-scope';

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('isTenantScoped', () => {
  it('recognises tenant-owned models', () => {
    expect(isTenantScoped('Stakeholder')).toBe(true);
  });

  it('ignores non-tenant models and undefined', () => {
    expect(isTenantScoped('Tenant')).toBe(false);
    expect(isTenantScoped(undefined)).toBe(false);
  });
});

describe('applyTenantScope', () => {
  it('leaves non-tenant models untouched', () => {
    const args = { where: { slug: 'acme' } };
    expect(applyTenantScope('Tenant', 'findFirst', args, TENANT)).toEqual(args);
  });

  it('stamps tenantId onto create data', () => {
    const out = applyTenantScope('Stakeholder', 'create', { data: { name: 'NAFDAC' } }, TENANT);
    expect(out.data).toEqual({ name: 'NAFDAC', tenantId: TENANT });
  });

  it('stamps tenantId onto every row of createMany', () => {
    const out = applyTenantScope(
      'Stakeholder',
      'createMany',
      { data: [{ name: 'A' }, { name: 'B' }] },
      TENANT,
    );
    expect(out.data).toEqual([
      { name: 'A', tenantId: TENANT },
      { name: 'B', tenantId: TENANT },
    ]);
  });

  it('adds tenantId to the where filter on reads', () => {
    const out = applyTenantScope('Stakeholder', 'findMany', { where: { name: 'X' } }, TENANT);
    expect(out.where).toEqual({ name: 'X', tenantId: TENANT });
  });

  it('adds a where filter even when none was supplied', () => {
    const out = applyTenantScope('Stakeholder', 'findMany', {}, TENANT);
    expect(out.where).toEqual({ tenantId: TENANT });
  });

  it('narrows bulk writes by tenant', () => {
    const out = applyTenantScope('Stakeholder', 'deleteMany', { where: { name: 'X' } }, TENANT);
    expect(out.where).toEqual({ name: 'X', tenantId: TENANT });
  });

  it('does not mutate the caller-supplied args object', () => {
    const args = { data: { name: 'NAFDAC' } };
    applyTenantScope('Stakeholder', 'create', args, TENANT);
    expect(args).toEqual({ data: { name: 'NAFDAC' } });
  });
});
