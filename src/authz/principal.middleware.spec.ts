import type { Request, Response } from 'express';
import { PrincipalMiddleware } from './principal.middleware';
import { PrincipalContext } from './principal-context';
import { Role } from './role';

function fakeRequest(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('PrincipalMiddleware', () => {
  const middleware = new PrincipalMiddleware();
  const res = {} as Response;

  it('establishes the principal from headers', () => {
    const req = fakeRequest({
      'x-user-id': 'u1',
      'x-user-role': 'FUNCTION_LEAD',
      'x-function-id': 'regulatory',
    });
    let seen;
    middleware.use(req, res, () => {
      seen = PrincipalContext.get();
    });
    expect(seen).toEqual({ userId: 'u1', role: Role.FUNCTION_LEAD, functionId: 'regulatory' });
  });

  it('runs without a principal when headers are absent', () => {
    const req = fakeRequest({});
    let calledNext = false;
    middleware.use(req, res, () => {
      calledNext = true;
      expect(PrincipalContext.get()).toBeUndefined();
    });
    expect(calledNext).toBe(true);
  });

  it('does not establish a principal for an unknown role', () => {
    const req = fakeRequest({ 'x-user-id': 'u1', 'x-user-role': 'wizard' });
    let seen: unknown = 'unset';
    middleware.use(req, res, () => {
      seen = PrincipalContext.get();
    });
    expect(seen).toBeUndefined();
  });
});
