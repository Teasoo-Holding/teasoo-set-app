import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditAction } from '../audit/audit-event';
import { AuditService } from '../audit/audit.service';
import { Permission } from '../authz/permission';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { TENANT_DIRECTORY, TenantDirectory, USER_DIRECTORY, UserDirectory } from './directories';
import { ImpersonationSigner } from './impersonation';
import { getSession } from './session';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signer: ImpersonationSigner,
    private readonly audit: AuditService,
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  /** The current authenticated identity, derived from the verified Supabase session. */
  @Get('me')
  me(@Req() req: Request) {
    const session = getSession(req);
    if (!session) throw new UnauthorizedException('Not authenticated.');
    return {
      userId: session.userId,
      role: session.role,
      functionId: session.functionId,
      reportsToId: session.reportsToId,
      tenant: session.tenantSlug,
      sessionExpiresAt: session.sessionExpiresAt,
      demo: session.demoMode === true,
      impersonation: session.impersonatorUserId
        ? { active: true, impersonatorUserId: session.impersonatorUserId, readOnly: session.readOnly }
        : { active: false },
    };
  }

  /**
   * Start impersonating a user (AUTH-5). Tenant Admin only; audited; returns a
   * short-lived, read-only grant the client sends back via the
   * `x-impersonation-grant` header.
   */
  @Post('impersonate')
  @RequirePermissions(Permission.IMPERSONATE)
  async impersonate(@Req() req: Request, @Body('targetUserId') targetUserId: string) {
    const actor = getSession(req);
    if (!actor) throw new UnauthorizedException('Not authenticated.');
    if (!targetUserId) throw new BadRequestException('targetUserId is required.');
    if (targetUserId === actor.userId) throw new BadRequestException('Cannot impersonate yourself.');

    const target = await this.users.findUserById(actor.tenantSlug, targetUserId);
    if (!target) throw new NotFoundException('Target user not found.');

    const tenantId = await this.tenants.findTenantIdBySlug(actor.tenantSlug);
    if (tenantId) {
      await this.audit.record({
        tenantId,
        action: AuditAction.IMPERSONATION_STARTED,
        actorUserId: actor.userId,
        resourceType: 'user',
        resourceId: target.userId,
      });
    }

    const { token, expiresAt } = await this.signer.mint({
      sub: target.userId,
      act: actor.userId,
      tenant: actor.tenantSlug,
    });
    return { grant: token, expiresAt, impersonating: { userId: target.userId, role: target.role } };
  }
}
