import type { Request } from 'express';
import { Role } from '../authz/role';
import { ClientType } from './session-timeout';

/** The verified session derived from a Supabase token. */
export interface AppSession {
  tenantSlug: string;
  userId: string;
  role: Role;
  functionId?: string;
  reportsToId?: string;
  /** When this session lapses under the tenant's per-client timeout (AUTH-4). */
  sessionExpiresAt?: Date;
  /** Set when an admin is impersonating this user (AUTH-5): the acting admin's id. */
  impersonatorUserId?: string;
  /** Impersonation sessions are read-only. */
  readOnly?: boolean;
  /** Set for a sandbox demo session (AUTH-3), so the UI can watermark it. */
  demoMode?: boolean;
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

/** Which client the request came from, for per-client session timeouts (AUTH-4). */
export function detectClientType(req: Request): ClientType {
  const explicit = req.header('x-client-type')?.trim().toLowerCase();
  if (explicit === 'mobile' || explicit === 'desktop') return explicit;
  const ua = req.header('user-agent') ?? '';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

/** The email's domain, lowercased, or undefined if malformed. */
export function extractDomain(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}
