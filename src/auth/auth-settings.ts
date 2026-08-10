export type AuthPrecedence = 'record_first' | 'idp_first';

/** Per-tenant policy for resolving identity attributes at sign-in (AUTH-2). */
export interface TenantAuthPolicy {
  precedence: AuthPrecedence;
  /** Dotted JWT claim paths, e.g. 'app_metadata.role'. */
  roleClaim?: string;
  functionClaim?: string;
  reportsToClaim?: string;
}

/** Safe default: the SET record is authoritative; IdP claims only fill gaps. */
export const DEFAULT_AUTH_POLICY: TenantAuthPolicy = { precedence: 'record_first' };

export function normalizePrecedence(value: string | undefined): AuthPrecedence {
  return value === 'idp_first' ? 'idp_first' : 'record_first';
}
