import type { Request } from 'express';
import { Role } from '../authz/role';

/** The verified session derived from a Supabase token. */
export interface AppSession {
  tenantSlug: string;
  userId: string;
  role: Role;
  functionId?: string;
  reportsToId?: string;
}

const SESSION_KEY = Symbol('app.session');

export function setSession(req: Request, session: AppSession): void {
  (req as unknown as Record<symbol, AppSession>)[SESSION_KEY] = session;
}

export function getSession(req: Request): AppSession | undefined {
  return (req as unknown as Record<symbol, AppSession | undefined>)[SESSION_KEY];
}

/** Extract a bearer token from the Authorization header. */
export function extractBearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : undefined;
}

/** The email's domain, lowercased, or undefined if malformed. */
export function extractDomain(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}
