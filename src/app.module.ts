import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthzModule } from './authz/authz.module';
import { PrincipalMiddleware } from './authz/principal.middleware';
import { EncryptionModule } from './encryption/encryption.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  imports: [PrismaModule, AuthzModule, EncryptionModule, StakeholdersModule, PlatformAnalyticsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every tenant route runs inside a resolved tenant context (TEN-1) and, when
    // present, an authenticated principal (§4.1)...
    consumer
      .apply(TenantContextMiddleware, PrincipalMiddleware)
      // ...except the cross-tenant platform routes (TEN-2), which are neither
      // tenant-scoped nor governed by tenant roles (platform-operator authz is a
      // separate plane, handled with the platform-admin identity).
      .exclude({ path: 'platform/(.*)', method: RequestMethod.ALL })
      .forRoutes('*');
  }
}
