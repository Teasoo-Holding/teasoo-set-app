import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { DemoSessionMiddleware } from './auth/demo-session.middleware';
import { ImpersonationMiddleware } from './auth/impersonation.middleware';
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
      .apply(DemoSessionMiddleware, SupabaseSessionMiddleware, ImpersonationMiddleware)
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');

    // Tenant context (TEN-1) is for tenant-scoped routes only — the /auth
    // endpoints are pre-tenant.
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'auth/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');

    // Principal (§4.1) is resolved for /auth too, so permission-gated auth
    // endpoints (e.g. POST /auth/impersonate) can be authorized.
    consumer
      .apply(PrincipalMiddleware)
      .exclude(
        { path: 'platform/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
