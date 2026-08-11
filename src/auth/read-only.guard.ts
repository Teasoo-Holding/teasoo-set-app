import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { getSession } from './session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces that a read-only session (an impersonation, AUTH-5) cannot perform
 * mutating requests. Registered globally.
 */
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const session = getSession(req);
    if (session?.readOnly && !SAFE_METHODS.has(req.method)) {
      throw new ForbiddenException('This is a read-only impersonation session.');
    }
    return true;
  }
}
