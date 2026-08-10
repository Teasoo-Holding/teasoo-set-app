import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from './permission';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { PrincipalContext } from './principal-context';
import { Role } from './role';

function guardWithRequired(required: Permission[] | undefined): PermissionsGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PermissionsGuard(reflector, new PermissionService());
}

const ctx = {
  getHandler: () => undefined,
  getClass: () => undefined,
} as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  it('allows routes that declare no permissions', () => {
    const guard = guardWithRequired(undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when the principal holds the required permission', () => {
    const guard = guardWithRequired([Permission.STAKEHOLDER_APPROVE]);
    const result = PrincipalContext.run({ userId: 'u1', role: Role.FUNCTION_LEAD }, () =>
      guard.canActivate(ctx),
    );
    expect(result).toBe(true);
  });

  it('forbids when the principal lacks the required permission', () => {
    const guard = guardWithRequired([Permission.STAKEHOLDER_APPROVE]);
    expect(() =>
      PrincipalContext.run({ userId: 'u2', role: Role.FIELD }, () => guard.canActivate(ctx)),
    ).toThrow(ForbiddenException);
  });

  it('rejects a protected route with no authenticated principal', () => {
    const guard = guardWithRequired([Permission.STAKEHOLDER_READ_DIRECTORY]);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('requires ALL listed permissions', () => {
    const guard = guardWithRequired([Permission.STAKEHOLDER_APPROVE, Permission.TIER_CHANGE_APPROVE]);
    // Function Lead has approve but not tier-change -> forbidden
    expect(() =>
      PrincipalContext.run({ userId: 'u3', role: Role.FUNCTION_LEAD }, () => guard.canActivate(ctx)),
    ).toThrow(ForbiddenException);
    // Leadership has both -> allowed
    const okAsLeadership = PrincipalContext.run({ userId: 'u4', role: Role.LEADERSHIP }, () =>
      guard.canActivate(ctx),
    );
    expect(okAsLeadership).toBe(true);
  });
});
