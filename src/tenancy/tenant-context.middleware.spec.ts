import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContext } from './tenant-context';

function fakeRequest(opts: { header?: string; hostname?: string }): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'x-tenant-id' ? opts.header : undefined,
    hostname: opts.hostname ?? '',
  } as unknown as Request;
}

describe('TenantContextMiddleware', () => {
  const middleware = new TenantContextMiddleware();
  const res = {} as Response;

  it('resolves the tenant from the x-tenant-id header and runs next in context', () => {
    const req = fakeRequest({ header: 'acme' });
    let seen: string | undefined;
    middleware.use(req, res, () => {
      seen = TenantContext.getTenantId();
    });
    expect(seen).toBe('acme');
  });

  it('falls back to the subdomain when no header is present', () => {
    const req = fakeRequest({ hostname: 'globex.teasoo.app' });
    let seen: string | undefined;
    middleware.use(req, res, () => {
      seen = TenantContext.getTenantId();
    });
    expect(seen).toBe('globex');
  });

  it('prefers the header over the subdomain', () => {
    const req = fakeRequest({ header: 'acme', hostname: 'globex.teasoo.app' });
    let seen: string | undefined;
    middleware.use(req, res, () => {
      seen = TenantContext.getTenantId();
    });
    expect(seen).toBe('acme');
  });

  it('rejects a request whose tenant cannot be determined', () => {
    const req = fakeRequest({ hostname: 'localhost' });
    const next = jest.fn();
    expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
    expect(next).not.toHaveBeenCalled();
  });
});
