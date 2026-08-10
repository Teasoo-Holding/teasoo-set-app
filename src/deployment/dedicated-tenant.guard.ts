import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from '../tenancy/tenant-context';
import { DeploymentConfig } from './deployment-config';

/**
 * On a dedicated instance, refuse any tenant other than the contracted one — a
 * belt-and-braces check on top of physical isolation (a dedicated instance only
 * holds one tenant's data and key anyway). Responds 404 so the instance does not
 * even acknowledge other tenants' existence.
 *
 * A no-op on shared instances and on non-tenant routes (/platform, /health).
 * Registered globally.
 */
@Injectable()
export class DedicatedTenantGuard implements CanActivate {
  constructor(private readonly deployment: DeploymentConfig) {}

  canActivate(): boolean {
    if (!this.deployment.isDedicated()) return true;

    const tenant = TenantContext.getTenantId();
    if (!tenant) return true; // non-tenant route

    if (!this.deployment.servesTenant(tenant)) {
      throw new NotFoundException('Unknown tenant on this instance.');
    }
    return true;
  }
}
