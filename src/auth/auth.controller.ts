import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { getSession } from './session';

@Controller('auth')
export class AuthController {
  /** The current authenticated identity, derived from the verified Supabase session. */
  @Get('me')
  me(@Req() req: Request) {
    const session = getSession(req);
    if (!session) throw new UnauthorizedException('Not authenticated.');
    return {
      userId: session.userId,
      role: session.role,
      functionId: session.functionId,
      tenant: session.tenantSlug,
    };
  }
}
