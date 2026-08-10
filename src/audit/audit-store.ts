import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEventRecord } from './audit-event';

/** The head (last event) of a tenant's chain. */
export interface ChainHead {
  seq: number;
  hash: string;
}

/**
 * Persistence for the audit log. Deliberately has no update/delete — the log is
 * append-only (also enforced by a DB trigger).
 */
export interface AuditStore {
  getHead(tenantId: string): Promise<ChainHead | null>;
  append(event: AuditEventRecord): Promise<void>;
  list(tenantId: string): Promise<AuditEventRecord[]>;
}

export const AUDIT_STORE = Symbol('AUDIT_STORE');

export class InMemoryAuditStore implements AuditStore {
  private readonly rows: AuditEventRecord[] = [];

  async getHead(tenantId: string): Promise<ChainHead | null> {
    const forTenant = this.rows.filter((r) => r.tenantId === tenantId);
    if (forTenant.length === 0) return null;
    const last = forTenant[forTenant.length - 1];
    return { seq: last.seq, hash: last.hash };
  }

  async append(event: AuditEventRecord): Promise<void> {
    this.rows.push({ ...event });
  }

  async list(tenantId: string): Promise<AuditEventRecord[]> {
    return this.rows.filter((r) => r.tenantId === tenantId).sort((a, b) => a.seq - b.seq);
  }

  /** Test-only: simulate tampering with a stored event's metadata. */
  tamperMetadata(tenantId: string, seq: number, metadata: Record<string, unknown>): void {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.seq === seq);
    if (row) row.metadata = metadata;
  }
}

@Injectable()
export class PrismaAuditStore implements AuditStore {
  constructor(private readonly prisma: PrismaService) {}

  async getHead(tenantId: string): Promise<ChainHead | null> {
    const last = await this.prisma.client.auditEvent.findFirst({
      where: { tenantId },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    return last ?? null;
  }

  async append(event: AuditEventRecord): Promise<void> {
    await this.prisma.client.auditEvent.create({
      data: {
        tenantId: event.tenantId,
        seq: event.seq,
        occurredAt: event.occurredAt,
        actorUserId: event.actorUserId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: event.metadata as object,
        prevHash: event.prevHash,
        hash: event.hash,
      },
    });
  }

  async list(tenantId: string): Promise<AuditEventRecord[]> {
    const rows = await this.prisma.client.auditEvent.findMany({
      where: { tenantId },
      orderBy: { seq: 'asc' },
    });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      seq: r.seq,
      occurredAt: r.occurredAt,
      actorUserId: r.actorUserId ?? undefined,
      action: r.action,
      resourceType: r.resourceType ?? undefined,
      resourceId: r.resourceId ?? undefined,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      prevHash: r.prevHash,
      hash: r.hash,
    }));
  }
}
