import { DEFAULT_SESSION_TIMEOUT, SessionTimeoutPolicy } from './session-timeout';

export type AuthPrecedence = 'record_first' | 'idp_first';

/** Per-tenant policy for resolving identity attributes at sign-in (AUTH-2) and session lifetime (AUTH-4). */
export interface TenantAuthPolicy {
  precedence: AuthPrecedence;
  /** Dotted JWT claim paths, e.g. 'app_metadata.role'. */
  roleClaim?: string;
  functionClaim?: string;
  reportsToClaim?: string;
  /** Optional; the resolver falls back to DEFAULT_SESSION_TIMEOUT when absent. */
  sessionTimeout?: SessionTimeoutPolicy;
}

/** Safe default: the SET record is authoritative; IdP claims only fill gaps; default 12h/8h timeouts. */
export const DEFAULT_AUTH_POLICY: TenantAuthPolicy = {
  precedence: 'record_first',
  sessionTimeout: DEFAULT_SESSION_TIMEOUT,
};

export function normalizePrecedence(value: string | undefined): AuthPrecedence {
  return value === 'idp_first' ? 'idp_first' : 'record_first';
}
