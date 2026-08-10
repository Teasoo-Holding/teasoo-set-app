import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  imports: [PrismaModule, StakeholdersModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Global: every route runs inside a resolved tenant context (TEN-1).
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
