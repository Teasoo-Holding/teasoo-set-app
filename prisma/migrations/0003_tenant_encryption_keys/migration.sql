-- EP1-S3 / TEN-3 — per-tenant encryption of free-text, with crypto-shredding.
--
-- Free-text fields (engagement notes, escalation descriptions — added by EP-3 /
-- EP-6) are encrypted at rest with AES-256-GCM under a PER-TENANT Data
-- Encryption Key (DEK). Envelope encryption: the DEK is stored here wrapped
-- (encrypted) by a master Key-Encryption-Key (a KMS-managed KEK in production).
--
-- Contractual data deletion = key destruction ("crypto-shredding"): set
-- wrapped_dek to NULL and stamp destroyed_at. The DEK is then gone, so every
-- value ever encrypted under it is permanently unrecoverable, without having to
-- locate and overwrite each ciphertext row.

CREATE TABLE "tenant_encryption_keys" (
  "tenant_id"    uuid PRIMARY KEY REFERENCES "tenants"("id"),
  "wrapped_dek"  bytea,
  "key_version"  int NOT NULL DEFAULT 1,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "destroyed_at" timestamptz
);
