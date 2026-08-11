-- EP1-S7 / AUTH-3 — demo/sandbox tenants.
-- 'sandbox' tenants power sales/training with a persona role-switcher; the
-- switcher is structurally refused for 'production' tenants.

ALTER TABLE "tenants" ADD COLUMN "kind" text NOT NULL DEFAULT 'production';
