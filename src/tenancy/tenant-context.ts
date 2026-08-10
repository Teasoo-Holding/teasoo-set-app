import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string;
}

/**
 * Ambient, per-request tenant context.
 *
 * TenantContextMiddleware resolves the tenant for an incoming request and runs
 * the rest of the request inside `run()`. Anything downstream — services, the
 * Prisma tenant-scope extension — reads the tenant from here instead of having
 * it threaded through every function signature. That is what makes tenant
 * scoping a property of the middleware rather than of developer discipline
 * (TEN-1).
 */
const storage = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  /** Run `fn` (and everything it awaits) with `tenantId` as the ambient tenant. */
  run<T>(tenantId: string, fn: () => T): T {
    return storage.run({ tenantId }, fn);
  },

  /** The current tenant, or undefined if not inside a tenant scope. */
  getTenantId(): string | undefined {
    return storage.getStore()?.tenantId;
  },

  /**
   * The current tenant, or throw. Tenant-scoped data access calls this so that
   * a query accidentally issued outside a request scope fails closed instead of
   * leaking across tenants.
   */
  requireTenantId(): string {
    const tenantId = storage.getStore()?.tenantId;
    if (!tenantId) {
      throw new Error(
        'No tenant in context: a tenant-scoped operation ran outside a tenant request scope.',
      );
    }
    return tenantId;
  },
};
