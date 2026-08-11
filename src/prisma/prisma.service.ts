import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../tenancy/tenant-context';
import { tenantScopeExtension } from '../tenancy/prisma-tenant.extension';

function buildClient() {
  return new PrismaClient().$extends(tenantScopeExtension);
}

type ExtendedClient = ReturnType<typeof buildClient>;
type TenantScopedTx = Parameters<Parameters<ExtendedClient['$transaction']>[0]>[0];

/**
 * Owns the Prisma client and the tenant-safe access path.
 *
 * `withTenant` is the entry point request handlers should use. It opens a
 * transaction and, on that same connection, sets the `app.current_tenant_id`
 * GUC that the RLS policy reads — so BOTH isolation layers are active for the
 * work inside it:
 *   1. the app-layer tenant-scope extension (injects tenant_id into args), and
 *   2. the database RLS policy (independent backstop).
 *
 * The tenant is taken from the ambient TenantContext, so callers never pass it.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: ExtendedClient = buildClient();

  async onModuleInit(): Promise<void> {
    // Non-fatal: let the app boot even if the database is unreachable (e.g. in
    // local dev before Supabase is configured). DB-backed routes will error
    // until a connection is available; /health and demo/non-DB paths still work.
    try {
      await this.client.$connect();
    } catch (err) {
      console.warn(
        `PrismaService: could not connect to the database at startup — continuing. ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async withTenant<T>(fn: (tx: TenantScopedTx) => Promise<T>): Promise<T> {
    const tenantId = TenantContext.requireTenantId();
    return this.client.$transaction(async (tx) => {
      // Bind the tenant for RLS on this transaction's connection. Local to the
      // transaction (third arg true), so it never leaks to a pooled connection.
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
