import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DedicatedTenantGuard } from './dedicated-tenant.guard';
import { DeploymentConfig } from './deployment-config';
import { DeploymentController } from './deployment.controller';

@Global()
@Module({
  providers: [
    // Constructed (and validated) once at startup; fail-fast on misconfiguration.
    { provide: DeploymentConfig, useFactory: () => new DeploymentConfig() },
    { provide: APP_GUARD, useClass: DedicatedTenantGuard },
  ],
  controllers: [DeploymentController],
  exports: [DeploymentConfig],
})
export class DeploymentModule {}
