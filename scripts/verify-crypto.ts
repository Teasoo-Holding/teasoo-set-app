/**
 * EP1-S3 / TEN-3 — proof of per-tenant encryption at rest and crypto-shredding.
 *
 * Runs the real migrations against PGlite, then drives CryptoService +
 * TenantKeyService through a Postgres-backed key store and asserts:
 *   A. free text is stored as ciphertext (the plaintext never hits the column);
 *   B. it round-trips back to plaintext with the tenant's key;
 *   C. one tenant's key cannot decrypt another tenant's ciphertext;
 *   D. after crypto-shredding a tenant's key, its stored ciphertext is
 *      permanently unrecoverable, while other tenants are unaffected.
 *
 *   npm run verify:crypto
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { CryptoService } from '../src/encryption/crypto.service';
import { KeyStore, StoredKey } from '../src/encryption/key-store';
import { KeyDestroyedError, TenantKeyService } from '../src/encryption/tenant-key.service';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function loadMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_/.test(name))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

/** KeyStore over PGlite, exercising the real tenant_encryption_keys DDL. */
class PgliteKeyStore implements KeyStore {
  constructor(private readonly db: PGlite) {}

  async find(tenantId: string): Promise<StoredKey | null> {
    const res = await this.db.query<{ wrapped_dek: Uint8Array | null; destroyed_at: Date | null }>(
      `SELECT wrapped_dek, destroyed_at FROM tenant_encryption_keys WHERE tenant_id = $1`,
      [tenantId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      wrappedDek: row.wrapped_dek ? Buffer.from(row.wrapped_dek) : null,
      destroyedAt: row.destroyed_at,
    };
  }

  async create(tenantId: string, wrappedDek: Buffer): Promise<void> {
    await this.db.query(`INSERT INTO tenant_encryption_keys(tenant_id, wrapped_dek) VALUES ($1, $2)`, [
      tenantId,
      wrappedDek,
    ]);
  }

  async destroy(tenantId: string): Promise<void> {
    await this.db.query(
      `UPDATE tenant_encryption_keys SET wrapped_dek = NULL, destroyed_at = now() WHERE tenant_id = $1`,
      [tenantId],
    );
  }
}

async function main() {
  const db = new PGlite();
  const checks: string[] = [];
  for (const sql of loadMigrations()) await db.exec(sql);

  // A scratch table standing in for a future free-text field (EP-3 engagement notes).
  await db.exec(`CREATE TABLE secure_notes (tenant_id uuid, ciphertext bytea)`);

  const crypto = new CryptoService(Buffer.alloc(32, 42));
  const keys = new TenantKeyService(crypto, new PgliteKeyStore(db));

  const acme = (
    await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('acme','Acme') RETURNING id`)
  ).rows[0].id;
  const globex = (
    await db.query<{ id: string }>(`INSERT INTO tenants(slug,name) VALUES('globex','Globex') RETURNING id`)
  ).rows[0].id;

  const NOTE = 'DG office raised concerns about the new label; follow up before Q3.';

  // Encrypt and persist a note for each tenant.
  for (const [tenant, text] of [
    [acme, NOTE],
    [globex, 'community meeting rescheduled'],
  ] as const) {
    const blob = crypto.encrypt(text, await keys.getDek(tenant));
    await db.query(`INSERT INTO secure_notes(tenant_id, ciphertext) VALUES ($1, $2)`, [tenant, blob]);
  }

  // A. what is stored is ciphertext, not the plaintext.
  {
    const stored = (
      await db.query<{ ciphertext: Uint8Array }>(
        `SELECT ciphertext FROM secure_notes WHERE tenant_id = $1`,
        [acme],
      )
    ).rows[0].ciphertext;
    const asText = Buffer.from(stored).toString('utf8');
    assert.ok(!asText.includes('DG office'), 'plaintext must not appear in the stored column');
    checks.push('free text is stored as ciphertext, not plaintext');
  }

  const readNote = async (tenantId: string): Promise<Uint8Array> =>
    (
      await db.query<{ ciphertext: Uint8Array }>(`SELECT ciphertext FROM secure_notes WHERE tenant_id = $1`, [
        tenantId,
      ])
    ).rows[0].ciphertext;

  // B. round-trips back with the tenant's key.
  {
    const blob = Buffer.from(await readNote(acme));
    assert.equal(crypto.decrypt(blob, await keys.getDek(acme)), NOTE);
    checks.push('ciphertext round-trips to plaintext with the tenant key');
  }

  // C. another tenant's key cannot decrypt it.
  {
    const blob = Buffer.from(await readNote(acme));
    const globexDek = await keys.getDek(globex);
    assert.throws(() => crypto.decrypt(blob, globexDek), 'cross-tenant decrypt must fail');
    checks.push('another tenant key cannot decrypt it');
  }

  // D. crypto-shred acme, then its note is unrecoverable; globex is fine.
  {
    await keys.destroy(acme);
    let threw = false;
    try {
      await keys.getDek(acme);
    } catch (err) {
      threw = err instanceof KeyDestroyedError;
    }
    assert.ok(threw, 'getDek must throw KeyDestroyedError after shredding');

    const stored = await new PgliteKeyStore(db).find(acme);
    assert.equal(stored?.wrappedDek, null, 'wrapped DEK must be gone after shredding');

    // globex still works
    const gBlob = Buffer.from(await readNote(globex));
    assert.equal(crypto.decrypt(gBlob, await keys.getDek(globex)), 'community meeting rescheduled');
    checks.push('after crypto-shred the tenant note is unrecoverable; other tenants unaffected');
  }

  await db.close();
  console.log('TEN-3 per-tenant encryption verified:');
  for (const c of checks) console.log(`  ✓ ${c}`);
}

main().catch((err) => {
  console.error('TEN-3 verification FAILED:', err.message);
  process.exit(1);
});
