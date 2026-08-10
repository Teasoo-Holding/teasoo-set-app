import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getSession } from '../auth/session';
import { PrincipalContext, RequestPrincipal } from './principal-context';
import { parseRole } from './role';

/**
 * Establishes the request principal from headers and runs the request inside it.
 *
 * SECURITY SEAM: resolving the actor from `x-user-*` headers is a stand-in for
 * verified identity. AUTH-1/AUTH-2 (EP1-S5) will replace this with role/function
 * resolved from signed SSO (SAML/OIDC) claims. Until then these headers are NOT
 * a trust boundary — the mechanism (context + guard) is what this story
 * delivers; the trusted source arrives with auth.
 *
 * Missing/invalid principal is left unset here; PermissionsGuard rejects
 * protected routes that then have no principal, while public routes still run.
 */
@Injectable()
export class PrincipalMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const principal = this.resolve(req);
    if (principal) {
      PrincipalContext.run(principal, () => next());
    } else {
      next();
    }
  }

  private resolve(req: Request): RequestPrincipal | undefined {
    // A verified Supabase session (AUTH-1) is the trusted source when present.
    const session = getSession(req);
    if (session) {
      return { userId: session.userId, role: session.role, functionId: session.functionId };
    }

    const userId = req.header('x-user-id')?.trim();
    const role = parseRole(req.header('x-user-role'));
    if (!userId || !role) return undefined;
    const functionId = req.header('x-function-id')?.trim() || undefined;
    return { userId, role, functionId };
  }
}
