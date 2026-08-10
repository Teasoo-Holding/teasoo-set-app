import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredKey {
  wrappedDek: Buffer | null;
  destroyedAt: Date | null;
}

/**
 * Persistence for per-tenant wrapped DEKs. Abstracted so the tenant-key logic
 * can be unit-tested with an in-memory store and verified against a real
 * database with the Prisma-backed one.
 */
export interface KeyStore {
  find(tenantId: string): Promise<StoredKey | null>;
  create(tenantId: string, wrappedDek: Buffer): Promise<void>;
  /** Crypto-shred: drop the wrapped DEK and tombstone the row. */
  destroy(tenantId: string): Promise<void>;
}

export const KEY_STORE = Symbol('KEY_STORE');

/** In-memory KeyStore for tests. */
export class InMemoryKeyStore implements KeyStore {
  private readonly rows = new Map<string, StoredKey>();

  async find(tenantId: string): Promise<StoredKey | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async create(tenantId: string, wrappedDek: Buffer): Promise<void> {
    this.rows.set(tenantId, { wrappedDek, destroyedAt: null });
  }

  async destroy(tenantId: string): Promise<void> {
    const row = this.rows.get(tenantId);
    if (row) {
      row.wrappedDek = null;
      row.destroyedAt = new Date();
    }
  }
}

/** Production KeyStore backed by the tenant_encryption_keys table. */
@Injectable()
export class PrismaKeyStore implements KeyStore {
  constructor(private readonly prisma: PrismaService) {}

  async find(tenantId: string): Promise<StoredKey | null> {
    const row = await this.prisma.client.tenantEncryptionKey.findUnique({ where: { tenantId } });
    if (!row) return null;
    return {
      wrappedDek: row.wrappedDek ? Buffer.from(row.wrappedDek) : null,
      destroyedAt: row.destroyedAt,
    };
  }

  async create(tenantId: string, wrappedDek: Buffer): Promise<void> {
    await this.prisma.client.tenantEncryptionKey.create({
      // Prisma's Bytes input wants a plain ArrayBuffer-backed Uint8Array.
      data: { tenantId, wrappedDek: new Uint8Array(wrappedDek), keyVersion: 1 },
    });
  }

  async destroy(tenantId: string): Promise<void> {
    await this.prisma.client.tenantEncryptionKey.update({
      where: { tenantId },
      data: { wrappedDek: null, destroyedAt: new Date() },
    });
  }
}
