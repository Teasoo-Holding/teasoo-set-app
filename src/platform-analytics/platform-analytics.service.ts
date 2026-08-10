import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** One row of the cross-tenant, metadata-only projection. No names, no notes. */
export interface TenantMetric {
  tenant_id: string;
  slug: string;
  stakeholder_count: number;
  last_stakeholder_at: Date | null;
  tenant_created_at: Date;
}

/**
 * The ONLY cross-tenant read path in the application (TEN-2).
 *
 * It is deliberately separate from the tenant-scoped PrismaService and
 * deliberately NOT wrapped in TenantContext — this path spans tenants by
 * design. It connects as the analytics role (ANALYTICS_DATABASE_URL), which has
 * SELECT on the metadata-only view and no privilege on the base tables, so it
 * structurally cannot read stakeholder names or engagement notes. It only ever
 * queries the view.
 */
@Injectable()
export class PlatformAnalyticsService implements OnModuleDestroy {
  private readonly client = new PrismaClient({
    datasourceUrl: process.env.ANALYTICS_DATABASE_URL || process.env.DATABASE_URL,
  });

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  tenantMetrics(): Promise<TenantMetric[]> {
    return this.client.$queryRaw<TenantMetric[]>`
      SELECT tenant_id, slug, stakeholder_count, last_stakeholder_at, tenant_created_at
      FROM platform_tenant_metrics
      ORDER BY slug
    `;
  }
}
