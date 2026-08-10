import { Injectable } from '@nestjs/common';
import { TenantContext } from '../tenancy/tenant-context';
import { CryptoService } from './crypto.service';
import { TenantKeyService } from './tenant-key.service';

/**
 * The seam feature code uses to encrypt/decrypt a free-text field with the
 * current tenant's key. The tenant comes from the ambient TenantContext, so
 * callers never handle keys or pass a tenant id — EP-3 (engagement notes) and
 * EP-6 (escalation descriptions) will call this.
 */
@Injectable()
export class TenantFieldCrypto {
  constructor(
    private readonly keys: TenantKeyService,
    private readonly crypto: CryptoService,
  ) {}

  async encrypt(plaintext: string): Promise<Buffer> {
    const dek = await this.keys.getDek(TenantContext.requireTenantId());
    return this.crypto.encrypt(plaintext, dek);
  }

  async decrypt(blob: Buffer): Promise<string> {
    const dek = await this.keys.getDek(TenantContext.requireTenantId());
    return this.crypto.decrypt(blob, dek);
  }
}
