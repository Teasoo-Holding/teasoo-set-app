import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { extractBearerToken, setSession } from './session';
import { SessionResolver } from './session-resolver';

/**
 * If the request carries a Supabase bearer token, verify it and attach the
 * resolved session to the request. The tenant and principal middlewares then
 * prefer that verified session over the dev `x-*` headers.
 *
 * A present-but-invalid token is a hard 401; an absent token is fine (the dev
 * header fallback applies until Supabase auth is configured).
 */
@Injectable()
export class SupabaseSessionMiddleware implements NestMiddleware {
  constructor(private readonly resolver: SessionResolver) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = extractBearerToken(req);
    if (!token) {
      next();
      return;
    }
    try {
      setSession(req, await this.resolver.resolve(token));
      next();
    } catch (err) {
      next(err);
    }
  }
}
