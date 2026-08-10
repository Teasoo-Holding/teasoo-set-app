import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthzModule } from './authz/authz.module';
import { PrincipalMiddleware } from './authz/principal.middleware';
import { DeploymentModule } from './deployment/deployment.module';
import { EncryptionModule } from './encryption/encryption.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  imports: [
    PrismaModule,
    DeploymentModule,
    AuthzModule,
    EncryptionModule,
    StakeholdersModule,
    PlatformAnalyticsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every tenant route runs inside a resolved tenant context (TEN-1) and, when
    // present, an authenticated principal (§4.1)...
    consumer
      .apply(TenantContextMiddleware, PrincipalMiddleware)
      // ...except routes that are not tenant-scoped: the cross-tenant platform
      // routes (TEN-2) and the deployment health/identity endpoint (TEN-4).
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
