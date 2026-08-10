import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

/**
 * Resolves the tenant for every incoming request and runs the rest of the
 * request pipeline inside that tenant's context. Because this is wired as
 * global middleware (see AppModule), no individual route or service has to
 * remember to establish tenant scope — that is the point of TEN-1.
 *
 * Tenant resolution here is deliberately simple: an `x-tenant-id` header (set
 * by an upstream gateway) wins, otherwise the leftmost host label (subdomain)
 * is used. Resolving the tenant from the authenticated identity / email-domain
 * routing is AUTH-1 (EP1-S5); this middleware is the seam that will plug into.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = this.resolveTenantId(req);
    if (!tenantId) {
      throw new BadRequestException('Unable to determine tenant for request.');
    }
    TenantContext.run(tenantId, () => next());
  }

  private resolveTenantId(req: Request): string | undefined {
    const header = req.header('x-tenant-id');
    if (header && header.trim()) return header.trim();

    const host = req.hostname ?? '';
    const label = host.split('.')[0];
    if (label && label !== 'www' && label !== 'localhost') return label;

    return undefined;
  }
}
