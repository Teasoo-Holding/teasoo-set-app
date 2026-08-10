import { Role } from '../authz/role';
import { extractIdpAttrs, getClaimPath, resolveAttributes } from './claim-resolver';

describe('getClaimPath', () => {
  it('reads nested dotted paths', () => {
    expect(getClaimPath({ app_metadata: { role: 'ADMIN' } } as never, 'app_metadata.role')).toBe('ADMIN');
  });

  it('returns undefined for a missing path', () => {
    expect(getClaimPath({ a: {} } as never, 'a.b.c')).toBeUndefined();
  });
});

describe('extractIdpAttrs', () => {
  it('maps configured claims to attributes', () => {
    const attrs = extractIdpAttrs(
      { app_metadata: { role: 'LEADERSHIP', fn: 'reg' } } as never,
      { precedence: 'idp_first', roleClaim: 'app_metadata.role', functionClaim: 'app_metadata.fn' },
    );
    expect(attrs).toEqual({ role: Role.LEADERSHIP, functionId: 'reg', reportsToId: undefined });
  });

  it('ignores an unparseable role claim', () => {
    const attrs = extractIdpAttrs(
      { app_metadata: { role: 'wizard' } } as never,
      { precedence: 'idp_first', roleClaim: 'app_metadata.role' },
    );
    expect(attrs.role).toBeUndefined();
  });

  it('extracts nothing when no claim paths are configured', () => {
    expect(extractIdpAttrs({ role: 'ADMIN' } as never, { precedence: 'record_first' })).toEqual({
      role: undefined,
      functionId: undefined,
      reportsToId: undefined,
    });
  });
});

describe('resolveAttributes', () => {
  const record = { role: Role.FIELD, functionId: 'rec-fn', reportsToId: 'rec-boss' };

  it('record_first keeps the record and lets IdP fill only gaps', () => {
    const out = resolveAttributes({ role: Role.FIELD }, { role: Role.ADMIN, functionId: 'idp-fn' }, 'record_first');
    expect(out).toEqual({ role: Role.FIELD, functionId: 'idp-fn', reportsToId: undefined });
  });

  it('idp_first prefers IdP values when present', () => {
    const out = resolveAttributes(record, { role: Role.ADMIN, functionId: 'idp-fn' }, 'idp_first');
    expect(out).toEqual({ role: Role.ADMIN, functionId: 'idp-fn', reportsToId: 'rec-boss' });
  });

  it('idp_first falls back to the record when a claim is absent', () => {
    const out = resolveAttributes(record, {}, 'idp_first');
    expect(out).toEqual({ role: Role.FIELD, functionId: 'rec-fn', reportsToId: 'rec-boss' });
  });

  it('always resolves a role from the record', () => {
    expect(resolveAttributes({ role: Role.LEADERSHIP }, {}, 'idp_first').role).toBe(Role.LEADERSHIP);
  });
});
