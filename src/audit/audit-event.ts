import { createHash } from 'node:crypto';

/** The genesis link for a tenant's chain (before any event exists). */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Well-known action names. `action` is an open string so future stories can add
 * their own (tier changes, engagement edits, exports, impersonation, …) without
 * churning a central enum; these are the ones the skeleton anticipates.
 */
export const AuditAction = {
  AUTH_SIGN_IN: 'auth.sign_in',
  AUTH_SIGN_OUT: 'auth.sign_out',
  PERMISSION_CHANGED: 'permission.changed',
  IMPERSONATION_STARTED: 'impersonation.started',
} as const;

export interface AuditEventInput {
  tenantId: string;
  action: string;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AuditEventRecord {
  tenantId: string;
  seq: number;
  occurredAt: Date;
  actorUserId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

/** Deterministic JSON with recursively sorted keys, so hashing is stable. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

/** The signed content of an event (everything except its own hash). */
export function eventPayload(event: Omit<AuditEventRecord, 'hash'>): Record<string, unknown> {
  return {
    tenantId: event.tenantId,
    seq: event.seq,
    occurredAt: event.occurredAt.toISOString(),
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata,
  };
}

/** hash = SHA256(prevHash || canonical(payload)). */
export function computeHash(event: Omit<AuditEventRecord, 'hash'>): string {
  return createHash('sha256')
    .update(event.prevHash)
    .update(canonicalize(eventPayload(event)))
    .digest('hex');
}
