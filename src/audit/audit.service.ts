import { Inject, Injectable } from '@nestjs/common';
import {
  AuditEventInput,
  AuditEventRecord,
  computeHash,
  GENESIS_HASH,
} from './audit-event';
import { AUDIT_STORE, AuditStore } from './audit-store';

export interface IntegrityResult {
  ok: boolean;
  /** The seq at which the chain first fails, if any. */
  brokenAtSeq?: number;
  reason?: string;
}

/**
 * Append-only, tamper-evident audit log (EP1-S12 skeleton).
 *
 * `record` links each event to the previous one via a SHA-256 hash chain;
 * `verifyIntegrity` recomputes the chain to detect any retrospective change
 * (ABC-4). Concrete write-sites (impersonation, tier changes, engagement edits,
 * exports, user/permission changes) are wired by their own stories; GOV-4
 * extends this with retention, export and scoped reads.
 *
 * NOTE: `record` reads the head then appends; concurrent writers to the same
 * tenant should serialize (advisory lock) — a hardening left to GOV-4. The
 * unique (tenant_id, seq) constraint fails a racing duplicate rather than
 * corrupting the chain.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_STORE) private readonly store: AuditStore) {}

  async record(input: AuditEventInput): Promise<AuditEventRecord> {
    const head = await this.store.getHead(input.tenantId);
    const seq = (head?.seq ?? 0) + 1;
    const prevHash = head?.hash ?? GENESIS_HASH;

    const withoutHash: Omit<AuditEventRecord, 'hash'> = {
      tenantId: input.tenantId,
      seq,
      occurredAt: input.occurredAt ?? new Date(),
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? {},
      prevHash,
    };
    const event: AuditEventRecord = { ...withoutHash, hash: computeHash(withoutHash) };

    await this.store.append(event);
    return event;
  }

  async verifyIntegrity(tenantId: string): Promise<IntegrityResult> {
    const events = await this.store.list(tenantId);
    let prevHash = GENESIS_HASH;
    let expectedSeq = 1;

    for (const event of events) {
      if (event.seq !== expectedSeq) {
        return { ok: false, brokenAtSeq: event.seq, reason: 'sequence gap or reordering' };
      }
      if (event.prevHash !== prevHash) {
        return { ok: false, brokenAtSeq: event.seq, reason: 'broken link to previous event' };
      }
      const { hash, ...rest } = event;
      if (computeHash(rest) !== hash) {
        return { ok: false, brokenAtSeq: event.seq, reason: 'event content altered' };
      }
      prevHash = event.hash;
      expectedSeq += 1;
    }

    return { ok: true };
  }
}
