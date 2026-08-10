import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  imports: [PrismaModule, StakeholdersModule, PlatformAnalyticsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route runs inside a resolved tenant context (TEN-1)...
    consumer
      .apply(TenantContextMiddleware)
      // ...except the cross-tenant platform routes (TEN-2), which must not be
      // pinned to a single tenant.
      .exclude({ path: 'platform/(.*)', method: RequestMethod.ALL })
      .forRoutes('*');
  }
}
