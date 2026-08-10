import { Prisma } from '@prisma/client';
import { TenantContext } from './tenant-context';
import { applyTenantScope, isTenantScoped } from './tenant-scope';

/**
 * Prisma client extension that scopes every operation on a tenant-owned model
 * to the ambient tenant (TEN-1, application layer).
 *
 * It reads the tenant from TenantContext — established by
 * TenantContextMiddleware — and rewrites the query args via `applyTenantScope`.
 * If a tenant-scoped model is queried with no tenant in context, it throws
 * (fail-closed) rather than running unscoped.
 */
export const tenantScopeExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isTenantScoped(model)) return query(args);
          const tenantId = TenantContext.requireTenantId();
          return query(applyTenantScope(model, operation, args, tenantId) as typeof args);
        },
      },
    },
  }),
);
