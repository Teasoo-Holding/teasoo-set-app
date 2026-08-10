import { TenantContext } from '../tenancy/tenant-context';
import { CryptoService } from './crypto.service';
import { InMemoryKeyStore } from './key-store';
import { TenantKeyService } from './tenant-key.service';
import { TenantFieldCrypto } from './tenant-field-crypto';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('TenantFieldCrypto', () => {
  const crypto = new CryptoService(Buffer.alloc(32, 3));
  const keys = new TenantKeyService(crypto, new InMemoryKeyStore());
  const field = new TenantFieldCrypto(keys, crypto);

  it('encrypts and decrypts within the same tenant context', async () => {
    const blob = await TenantContext.run(A, () => field.encrypt('minister was supportive'));
    const back = await TenantContext.run(A, () => field.decrypt(blob));
    expect(back).toBe('minister was supportive');
  });

  it('cannot decrypt one tenant blob in another tenant context', async () => {
    const blob = await TenantContext.run(A, () => field.encrypt('for A only'));
    await expect(TenantContext.run(B, () => field.decrypt(blob))).rejects.toThrow();
  });

  it('refuses to encrypt with no tenant in context', async () => {
    await expect(field.encrypt('orphan')).rejects.toThrow(/No tenant in context/);
  });
});
