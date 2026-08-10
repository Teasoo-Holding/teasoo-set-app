import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseSessionMiddleware } from './auth/supabase-session.middleware';
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
    AuditModule,
    AuthModule,
    AuthzModule,
    EncryptionModule,
    StakeholdersModule,
    PlatformAnalyticsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Verify the Supabase session (AUTH-1) on every route except the non-tenant
    // platform/health endpoints. This attaches the verified session for the
    // tenant/principal middlewares and the /auth endpoints to read.
    consumer
      .apply(SupabaseSessionMiddleware)
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');

    // Resolve tenant (TEN-1) and principal (§4.1) for tenant-scoped routes only —
    // both prefer the verified session over the dev headers. The /auth endpoints
    // are pre-tenant and read the session directly.
    consumer
      .apply(TenantContextMiddleware, PrincipalMiddleware)
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'auth/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
