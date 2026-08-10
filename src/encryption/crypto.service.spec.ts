import { randomBytes } from 'node:crypto';
import { CryptoService, loadMasterKey } from './crypto.service';

const masterKey = Buffer.alloc(32, 7);

describe('CryptoService', () => {
  const crypto = new CryptoService(masterKey);
  const dek = crypto.generateDek();

  it('rejects a master key that is not 32 bytes', () => {
    expect(() => new CryptoService(Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it('round-trips a string through encrypt/decrypt', () => {
    const blob = crypto.encrypt('DG raised concerns about the label', dek);
    expect(crypto.decrypt(blob, dek)).toBe('DG raised concerns about the label');
  });

  it('does not leave the plaintext visible in the ciphertext', () => {
    const blob = crypto.encrypt('secret note', dek);
    expect(blob.toString('utf8')).not.toContain('secret note');
    expect(blob.toString('latin1')).not.toContain('secret note');
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = crypto.encrypt('same', dek);
    const b = crypto.encrypt('same', dek);
    expect(a.equals(b)).toBe(false);
    expect(crypto.decrypt(a, dek)).toBe(crypto.decrypt(b, dek));
  });

  it('fails to decrypt with the wrong key', () => {
    const blob = crypto.encrypt('secret', dek);
    const otherDek = crypto.generateDek();
    expect(() => crypto.decrypt(blob, otherDek)).toThrow();
  });

  it('detects tampering via the auth tag', () => {
    const blob = crypto.encrypt('secret', dek);
    blob[blob.length - 1] ^= 0xff;
    expect(() => crypto.decrypt(blob, dek)).toThrow();
  });

  it('wraps and unwraps a DEK', () => {
    const wrapped = crypto.wrapDek(dek);
    expect(wrapped.equals(dek)).toBe(false);
    expect(crypto.unwrapDek(wrapped).equals(dek)).toBe(true);
  });

  describe('loadMasterKey', () => {
    it('reads a 32-byte base64 key', () => {
      const env = { MASTER_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
      expect(loadMasterKey(env).length).toBe(32);
    });

    it('throws when missing', () => {
      expect(() => loadMasterKey({})).toThrow(/not set/);
    });

    it('throws when the wrong length', () => {
      expect(() => loadMasterKey({ MASTER_ENCRYPTION_KEY: 'AAAA' })).toThrow(/32 bytes/);
    });
  });
});
