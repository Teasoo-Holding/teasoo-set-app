import { CryptoService } from './crypto.service';
import { KeyStore } from './key-store';

/** Thrown when a tenant's key has been crypto-shredded; their ciphertext is unrecoverable. */
export class KeyDestroyedError extends Error {
  constructor(tenantId: string) {
    super(`Encryption key for tenant ${tenantId} has been destroyed; its data is unrecoverable.`);
    this.name = 'KeyDestroyedError';
  }
}

/**
 * Resolves the Data Encryption Key for a tenant, provisioning one on first use
 * and caching the unwrapped DEK in memory for the process lifetime.
 *
 * Once a tenant's key is destroyed, `getDek` refuses to return one — never
 * silently re-provisioning — so historical ciphertext stays unreadable (TEN-3).
 */
export class TenantKeyService {
  private readonly cache = new Map<string, Buffer>();

  constructor(
    private readonly crypto: CryptoService,
    private readonly store: KeyStore,
  ) {}

  async getDek(tenantId: string): Promise<Buffer> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const existing = await this.store.find(tenantId);
    if (existing) {
      if (existing.destroyedAt || !existing.wrappedDek) {
        throw new KeyDestroyedError(tenantId);
      }
      const dek = this.crypto.unwrapDek(existing.wrappedDek);
      this.cache.set(tenantId, dek);
      return dek;
    }

    const dek = this.crypto.generateDek();
    await this.store.create(tenantId, this.crypto.wrapDek(dek));
    this.cache.set(tenantId, dek);
    return dek;
  }

  /** Crypto-shred this tenant's key: destroys the stored DEK and evicts the cache. */
  async destroy(tenantId: string): Promise<void> {
    await this.store.destroy(tenantId);
    this.cache.delete(tenantId);
  }
}
