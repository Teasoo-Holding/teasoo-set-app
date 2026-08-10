import { CryptoService } from './crypto.service';
import { InMemoryKeyStore } from './key-store';
import { KeyDestroyedError, TenantKeyService } from './tenant-key.service';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('TenantKeyService', () => {
  let crypto: CryptoService;
  let store: InMemoryKeyStore;
  let keys: TenantKeyService;

  beforeEach(() => {
    crypto = new CryptoService(Buffer.alloc(32, 9));
    store = new InMemoryKeyStore();
    keys = new TenantKeyService(crypto, store);
  });

  it('provisions a key on first use and reuses it afterwards', async () => {
    const first = await keys.getDek(A);
    const second = await keys.getDek(A);
    expect(first.equals(second)).toBe(true);
  });

  it('persists the DEK only in wrapped form', async () => {
    const dek = await keys.getDek(A);
    const stored = await store.find(A);
    expect(stored?.wrappedDek).toBeTruthy();
    expect(stored!.wrappedDek!.equals(dek)).toBe(false);
    expect(crypto.unwrapDek(stored!.wrappedDek!).equals(dek)).toBe(true);
  });

  it('gives different tenants different keys', async () => {
    const a = await keys.getDek(A);
    const b = await keys.getDek(B);
    expect(a.equals(b)).toBe(false);
  });

  it('one tenant cannot decrypt the ciphertext of another', async () => {
    const aDek = await keys.getDek(A);
    const bDek = await keys.getDek(B);
    const blob = crypto.encrypt('confidential', aDek);
    expect(() => crypto.decrypt(blob, bDek)).toThrow();
  });

  describe('crypto-shredding', () => {
    it('makes the tenant data unrecoverable after destroy', async () => {
      const dek = await keys.getDek(A);
      const blob = crypto.encrypt('sensitive engagement note', dek);

      await keys.destroy(A);

      // The key is gone: the service refuses to return a DEK...
      await expect(keys.getDek(A)).rejects.toBeInstanceOf(KeyDestroyedError);
      // ...and the stored key can no longer decrypt the historical ciphertext.
      const stored = await store.find(A);
      expect(stored?.wrappedDek).toBeNull();
      expect(stored?.destroyedAt).toBeInstanceOf(Date);
      // (blob is now permanently unreadable — there is no DEK to try.)
      expect(blob.length).toBeGreaterThan(0);
    });

    it('does not affect other tenants', async () => {
      await keys.getDek(A);
      const bDek = await keys.getDek(B);
      const blob = crypto.encrypt('still fine', bDek);

      await keys.destroy(A);

      expect(crypto.decrypt(blob, await keys.getDek(B))).toBe('still fine');
    });
  });
});
