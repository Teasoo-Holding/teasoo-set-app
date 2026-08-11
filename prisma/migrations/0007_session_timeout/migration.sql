-- EP1-S8 / AUTH-4 — per-tenant, per-client-type session timeout.
-- Defaults: 12h (720 min) on mobile, 8h (480 min) on desktop.

ALTER TABLE "tenant_auth_settings"
  ADD COLUMN "auth_time_claim" text,
  ADD COLUMN "session_timeout_mobile_minutes" int NOT NULL DEFAULT 720,
  ADD COLUMN "session_timeout_desktop_minutes" int NOT NULL DEFAULT 480;
