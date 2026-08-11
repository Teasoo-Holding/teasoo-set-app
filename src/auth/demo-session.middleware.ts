import { Inject, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { DEMO_DIRECTORY, DemoDirectory } from './demo-directory';
import { DEMO_SESSION_HEADER, DemoSessionSigner } from './demo-session';
import { setSession } from './session';

/**
 * If the request carries a demo-session token (AUTH-3), verify it and — only for
 * a sandbox tenant — establish a watermarked session for the chosen persona.
 * Runs before the Supabase middleware. A production tenant can never yield a demo
 * session (the token is only minted for sandbox tenants, and re-checked here).
 */
@Injectable()
export class DemoSessionMiddleware implements NestMiddleware {
  constructor(
    private readonly signer: DemoSessionSigner,
    @Inject(DEMO_DIRECTORY) private readonly demo: DemoDirectory,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.header(DEMO_SESSION_HEADER);
    if (!token) {
      next();
      return;
    }
    try {
      const claims = await this.signer.verify(token);
      if ((await this.demo.findTenantKind(claims.tenant)) !== 'sandbox') {
        throw new Error('demo sessions are only valid for sandbox tenants');
      }
      const persona = await this.demo.findPersona(claims.tenant, claims.sub);
      if (!persona) throw new Error('unknown persona');

      setSession(req, {
        tenantSlug: claims.tenant,
        userId: persona.userId,
        role: persona.role,
        functionId: persona.functionId,
        reportsToId: persona.reportsToId,
        demoMode: true,
      });
      res.setHeader('X-Teasoo-Demo', 'true');
      next();
    } catch {
      next(new UnauthorizedException('Invalid demo session.'));
    }
  }
}
