import { Inject, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { Permission } from '../authz/permission';
import { PermissionService } from '../authz/permission.service';
import { USER_DIRECTORY, UserDirectory } from './directories';
import { ImpersonationSigner, IMPERSONATION_GRANT_HEADER } from './impersonation';
import { getSession, setSession } from './session';

/**
 * If the request carries a valid impersonation grant (AUTH-5), replace the
 * session with a read-only session for the impersonated user, tagged with the
 * acting admin. Runs after the Supabase session is resolved, so the presenter is
 * verified to be the admin the grant was issued to. Absent grant → no-op.
 */
@Injectable()
export class ImpersonationMiddleware implements NestMiddleware {
  constructor(
    private readonly signer: ImpersonationSigner,
    private readonly permissions: PermissionService,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const grantToken = req.header(IMPERSONATION_GRANT_HEADER);
    if (!grantToken) {
      next();
      return;
    }

    const actor = getSession(req);
    if (!actor) {
      next(new UnauthorizedException('Impersonation requires an authenticated admin.'));
      return;
    }

    try {
      const grant = await this.signer.verify(grantToken);
      if (grant.act !== actor.userId || grant.tenant !== actor.tenantSlug) {
        throw new Error('grant does not match the acting admin');
      }
      if (!this.permissions.can(actor.role, Permission.IMPERSONATE)) {
        throw new Error('actor may not impersonate');
      }
      const target = await this.users.findUserById(actor.tenantSlug, grant.sub);
      if (!target || target.status !== 'active') {
        throw new Error('impersonation target is invalid');
      }

      setSession(req, {
        tenantSlug: actor.tenantSlug,
        userId: target.userId,
        role: target.role,
        functionId: target.functionId,
        reportsToId: target.reportsToId,
        impersonatorUserId: actor.userId,
        readOnly: true,
      });
      next();
    } catch {
      next(new UnauthorizedException('Invalid impersonation grant.'));
    }
  }
}
