import { Controller, Get } from '@nestjs/common';
import { PlatformAnalyticsService } from './platform-analytics.service';

/**
 * Platform-operator endpoint. Mounted under /platform, which AppModule EXCLUDES
 * from the tenant middleware — these routes are cross-tenant by design and must
 * not run inside a single tenant's context. Operator authz (platform-admin
 * only) lands with the RBAC work (EP1-S10).
 */
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('tenants')
  tenants() {
    return this.analytics.tenantMetrics();
  }
}
