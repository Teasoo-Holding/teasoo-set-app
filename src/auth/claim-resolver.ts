import type { JWTPayload } from 'jose';
import { parseRole, Role } from '../authz/role';
import { AuthPrecedence, TenantAuthPolicy } from './auth-settings';

/** Identity attributes from the SET user record (role is always present). */
export interface RecordAttrs {
  role: Role;
  functionId?: string;
  reportsToId?: string;
}

/** Identity attributes as read from IdP claims (any may be absent). */
export interface IdpAttrs {
  role?: Role;
  functionId?: string;
  reportsToId?: string;
}

export interface ResolvedAttrs {
  role: Role;
  functionId?: string;
  reportsToId?: string;
}

/** Read a dotted path (e.g. "app_metadata.role") from a claims object. */
export function getClaimPath(claims: JWTPayload, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[key];
    return undefined;
  }, claims);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Extract the IdP-provided attributes named by the tenant policy. */
export function extractIdpAttrs(claims: JWTPayload, policy: TenantAuthPolicy): IdpAttrs {
  return {
    role: policy.roleClaim ? parseRole(asString(getClaimPath(claims, policy.roleClaim))) : undefined,
    functionId: policy.functionClaim ? asString(getClaimPath(claims, policy.functionClaim)) : undefined,
    reportsToId: policy.reportsToClaim ? asString(getClaimPath(claims, policy.reportsToClaim)) : undefined,
  };
}

/**
 * Combine the record and IdP attributes per the tenant's precedence (AUTH-2).
 * `record_first` uses the record and lets IdP fill only what is missing;
 * `idp_first` prefers the IdP claim when present, falling back to the record.
 * Role always resolves because the record's role is required.
 */
export function resolveAttributes(
  record: RecordAttrs,
  idp: IdpAttrs,
  precedence: AuthPrecedence,
): ResolvedAttrs {
  const pick = <T>(recordVal: T | undefined, idpVal: T | undefined): T | undefined =>
    precedence === 'idp_first' ? (idpVal ?? recordVal) : (recordVal ?? idpVal);

  return {
    role: (precedence === 'idp_first' ? (idp.role ?? record.role) : record.role) satisfies Role,
    functionId: pick(record.functionId, idp.functionId),
    reportsToId: pick(record.reportsToId, idp.reportsToId),
  };
}
