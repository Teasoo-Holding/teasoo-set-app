import { Controller, Get } from '@nestjs/common';
import { PlatformAnalyticsService } from './platform-analytics.service';

/**
 * Platform-operator endpoint. Mounted under /platform, which AppModule EXCLUDES
 * from the tenant middleware — these routes are cross-tenant by design and must
 * not run inside a single tenant's context.
 *
 * NOTE: these routes are not yet authorized. Platform-operator authz is a
 * separate identity plane from tenant roles (the EP1-S10 matrix), tracked in the
 * BACKLOG parking lot — it needs the platform-admin identity from AUTH (EP1-S5).
 */
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('tenants')
  tenants() {
    return this.analytics.tenantMetrics();
  }
}
