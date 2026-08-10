import { TenantContext } from './tenant-context';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('TenantContext', () => {
  it('exposes the tenant inside run()', () => {
    TenantContext.run(A, () => {
      expect(TenantContext.getTenantId()).toBe(A);
      expect(TenantContext.requireTenantId()).toBe(A);
    });
  });

  it('has no tenant outside any run()', () => {
    expect(TenantContext.getTenantId()).toBeUndefined();
    expect(() => TenantContext.requireTenantId()).toThrow(/No tenant in context/);
  });

  it('keeps nested scopes isolated', () => {
    TenantContext.run(A, () => {
      TenantContext.run(B, () => {
        expect(TenantContext.getTenantId()).toBe(B);
      });
      expect(TenantContext.getTenantId()).toBe(A);
    });
  });

  it('preserves the tenant across async boundaries', async () => {
    await TenantContext.run(A, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(TenantContext.getTenantId()).toBe(A);
    });
  });

  it('keeps concurrent scopes from bleeding into each other', async () => {
    const seen: string[] = [];
    await Promise.all([
      TenantContext.run(A, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(`A:${TenantContext.getTenantId()}`);
      }),
      TenantContext.run(B, async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(`B:${TenantContext.getTenantId()}`);
      }),
    ]);
    expect(seen.sort()).toEqual([`A:${A}`, `B:${B}`]);
  });
});
