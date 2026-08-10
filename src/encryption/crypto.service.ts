import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated-encryption primitives for TEN-3.
 *
 * AES-256-GCM. The packed byte layout is: [version:1][iv:12][authTag:16][ciphertext].
 * The auth tag makes tampering detectable, and decrypting with the wrong key
 * fails loudly rather than returning garbage — which is exactly what gives
 * crypto-shredding its teeth.
 *
 * The master key wraps each tenant's DEK (envelope encryption). In production it
 * is a KMS-managed KEK; here it is injected so tests can pass a fixed key.
 */
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 1;
const HEADER_LEN = 1 + IV_LEN + TAG_LEN;

export class CryptoService {
  constructor(private readonly masterKey: Buffer) {
    if (masterKey.length !== KEY_LEN) {
      throw new Error(`Master key must be ${KEY_LEN} bytes (AES-256); got ${masterKey.length}.`);
    }
  }

  /** A fresh random Data Encryption Key. */
  generateDek(): Buffer {
    return randomBytes(KEY_LEN);
  }

  /** Encrypt a DEK with the master key, for storage. */
  wrapDek(dek: Buffer): Buffer {
    return this.encryptBytes(dek, this.masterKey);
  }

  /** Recover a DEK previously produced by wrapDek. */
  unwrapDek(wrapped: Buffer): Buffer {
    return this.decryptBytes(wrapped, this.masterKey);
  }

  /** Encrypt a UTF-8 string with a DEK. */
  encrypt(plaintext: string, dek: Buffer): Buffer {
    return this.encryptBytes(Buffer.from(plaintext, 'utf8'), dek);
  }

  /** Decrypt a value produced by encrypt back to its string. Throws on a wrong key or tampering. */
  decrypt(blob: Buffer, dek: Buffer): string {
    return this.decryptBytes(blob, dek).toString('utf8');
  }

  private encryptBytes(plain: Buffer, key: Buffer): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
  }

  private decryptBytes(blob: Buffer, key: Buffer): Buffer {
    if (blob.length < HEADER_LEN) {
      throw new Error('Ciphertext is too short to be valid.');
    }
    const version = blob[0];
    if (version !== VERSION) {
      throw new Error(`Unsupported ciphertext version ${version}.`);
    }
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, HEADER_LEN);
    const ciphertext = blob.subarray(HEADER_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

/** Build the master key from a base64 env var (32 bytes / 256 bits). */
export function loadMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.MASTER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('MASTER_ENCRYPTION_KEY is not set.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(`MASTER_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes; got ${key.length}.`);
  }
  return key;
}
