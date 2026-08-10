-- EP1-S12 — audit log skeleton (GOV-4 extends this).
--
-- Append-only, hash-chained event log. Two layers of tamper-resistance:
--   1. a per-tenant hash chain (hash = SHA256(prev_hash || canonical(event))),
--      so any alteration/deletion/reordering breaks verification (ABC-4); and
--   2. a trigger that blocks UPDATE and DELETE, so the rows are immutable at the
--      database (defense-in-depth, like the RLS backstop for tenant data).

CREATE TABLE "audit_events" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     uuid NOT NULL,
  "seq"           int NOT NULL,
  "occurred_at"   timestamptz NOT NULL,
  "actor_user_id" uuid,
  "action"        text NOT NULL,
  "resource_type" text,
  "resource_id"   text,
  "metadata"      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "prev_hash"     text NOT NULL,
  "hash"          text NOT NULL,
  UNIQUE ("tenant_id", "seq")
);

CREATE INDEX "audit_events_tenant_seq_idx" ON "audit_events" ("tenant_id", "seq");

-- Append-only: refuse any UPDATE or DELETE.
CREATE FUNCTION "audit_events_no_mutate"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_block_mutate"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_no_mutate"();
