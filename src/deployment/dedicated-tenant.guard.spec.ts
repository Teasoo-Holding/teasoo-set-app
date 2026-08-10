import { NotFoundException } from '@nestjs/common';
import { TenantContext } from '../tenancy/tenant-context';
import { DedicatedTenantGuard } from './dedicated-tenant.guard';
import { DeploymentConfig } from './deployment-config';

describe('DedicatedTenantGuard', () => {
  it('allows any tenant on a shared instance', () => {
    const guard = new DedicatedTenantGuard(new DeploymentConfig({ DEPLOYMENT_MODE: 'shared' }));
    const result = TenantContext.run('globex', () => guard.canActivate());
    expect(result).toBe(true);
  });

  describe('on a dedicated instance', () => {
    const guard = new DedicatedTenantGuard(
      new DeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'unilever' }),
    );

    it('allows the contracted tenant', () => {
      expect(TenantContext.run('unilever', () => guard.canActivate())).toBe(true);
    });

    it('rejects any other tenant with 404', () => {
      expect(() => TenantContext.run('acme', () => guard.canActivate())).toThrow(NotFoundException);
    });

    it('allows non-tenant routes (no tenant in context)', () => {
      expect(guard.canActivate()).toBe(true);
    });
  });
});
