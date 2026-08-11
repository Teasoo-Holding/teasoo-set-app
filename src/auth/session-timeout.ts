import type { JWTPayload } from 'jose';
import { getClaimPath } from './claim-resolver';

export type ClientType = 'mobile' | 'desktop';

/** Per-tenant, per-client-type session lifetime (AUTH-4). */
export interface SessionTimeoutPolicy {
  mobileMinutes: number;
  desktopMinutes: number;
  /**
   * A claim holding the session's stable start time (epoch seconds), used
   * instead of `iat` so the cap survives token refresh. Supabase can add this
   * via an Auth Hook; without it we fall back to `iat`.
   */
  authTimeClaim?: string;
}

/** PRD defaults: 12h on mobile, 8h on desktop. */
export const DEFAULT_SESSION_TIMEOUT: SessionTimeoutPolicy = {
  mobileMinutes: 12 * 60,
  desktopMinutes: 8 * 60,
};

/** The session's start time in epoch seconds, or undefined if unknowable. */
export function sessionStart(claims: JWTPayload, authTimeClaim?: string): number | undefined {
  if (authTimeClaim) {
    const value = getClaimPath(claims, authTimeClaim);
    if (typeof value === 'number') return value;
  }
  return typeof claims.iat === 'number' ? claims.iat : undefined;
}

function timeoutMinutes(clientType: ClientType, policy: SessionTimeoutPolicy): number {
  return clientType === 'mobile' ? policy.mobileMinutes : policy.desktopMinutes;
}

export function sessionExpiry(
  startSeconds: number,
  clientType: ClientType,
  policy: SessionTimeoutPolicy,
): Date {
  return new Date((startSeconds + timeoutMinutes(clientType, policy) * 60) * 1000);
}

export function isSessionExpired(
  startSeconds: number,
  clientType: ClientType,
  policy: SessionTimeoutPolicy,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= sessionExpiry(startSeconds, clientType, policy).getTime();
}
