import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [
    PermissionService,
    // Global guard: enforces @RequirePermissions everywhere, passes routes that
    // declare none.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PermissionService],
})
export class AuthzModule {}
