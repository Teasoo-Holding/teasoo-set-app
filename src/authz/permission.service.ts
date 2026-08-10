import { Injectable } from '@nestjs/common';
import { Permission, PERMISSION_MATRIX } from './permission';
import { Role } from './role';

@Injectable()
export class PermissionService {
  can(role: Role, permission: Permission): boolean {
    return PERMISSION_MATRIX[role].has(permission);
  }

  canAll(role: Role, permissions: Permission[]): boolean {
    return permissions.every((p) => this.can(role, p));
  }

  permissionsFor(role: Role): ReadonlySet<Permission> {
    return PERMISSION_MATRIX[role];
  }
}
