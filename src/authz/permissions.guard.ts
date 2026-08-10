import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from './permission';
import { PermissionService } from './permission.service';
import { PrincipalContext } from './principal-context';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * Enforces @RequirePermissions. Registered globally, but only acts on routes
 * that declare required permissions; everything else passes through.
 *
 *  - no required permissions      -> allow
 *  - required but no principal     -> 401 Unauthorized
 *  - principal lacks a permission  -> 403 Forbidden
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) return true;

    const principal = PrincipalContext.get();
    if (!principal) {
      throw new UnauthorizedException('Authentication required.');
    }

    if (!this.permissions.canAll(principal.role, required)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return true;
  }
}
