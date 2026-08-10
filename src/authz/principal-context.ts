import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from './role';

/** The authenticated actor for a request. */
export interface RequestPrincipal {
  userId: string;
  role: Role;
  /** The function the user belongs to, for function-scoped checks (may be absent for org-wide roles). */
  functionId?: string;
  /** The user this person reports to, for escalation routing / team rollups. */
  reportsToId?: string;
}

/**
 * Ambient, per-request principal — the authorization counterpart to
 * TenantContext. Populated by PrincipalMiddleware and read by PermissionsGuard,
 * so authorization does not depend on threading the actor through call sites.
 */
const storage = new AsyncLocalStorage<RequestPrincipal>();

export const PrincipalContext = {
  run<T>(principal: RequestPrincipal, fn: () => T): T {
    return storage.run(principal, fn);
  },

  get(): RequestPrincipal | undefined {
    return storage.getStore();
  },

  require(): RequestPrincipal {
    const principal = storage.getStore();
    if (!principal) {
      throw new Error('No principal in context: a protected operation ran without an authenticated actor.');
    }
    return principal;
  },
};
