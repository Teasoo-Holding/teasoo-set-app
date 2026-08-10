import { Controller, Get } from '@nestjs/common';
import { DeploymentConfig } from './deployment-config';

/**
 * Liveness + deployment-identity endpoint. Excluded from the tenant middleware
 * (it is not tenant-scoped). Lets ops confirm an instance is the mode/region/
 * tenant they expect — important for verifying a dedicated instance is isolated.
 */
@Controller('health')
export class DeploymentController {
  constructor(private readonly deployment: DeploymentConfig) {}

  @Get()
  health() {
    return { status: 'ok', deployment: this.deployment.info() };
  }
}
