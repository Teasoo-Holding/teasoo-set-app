import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Marks a route (or controller) as requiring the given permissions. Enforced by
 * PermissionsGuard. A route with no such decorator is not permission-gated.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
