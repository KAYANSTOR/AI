-- 0086: Phase 5
--   1. WhatsApp message templates (Meta Template Messages) so business-initiated
--      messages can be delivered after the 24-hour customer service window, plus
--      template fields on the outbox and appointment reminder schedule.
--   2. Per-user productivity connectors (Gmail / Google Calendar) storing OAuth
--      tokens encrypted with AES-256-GCM.
--   3. Fill-only secret vault: values are encrypted server-side and can never be
--      read back by the model or the browser; only a secret_ref is exposed.
--
-- Privileges are granted/revoked per table only. No schema-wide REVOKE, and no embedded-file database engine.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. WhatsApp message templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  meta_template_id TEXT CHECK (meta_template_id IS NULL OR length(meta_template_id) <= 128),
  template_name TEXT NOT NULL CHECK (template_name ~ '^[a-z0-9][a-z0-9_]{0,511}$'),
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  body_text TEXT NOT NULL CHECK (length(btrim(body_text)) BETWEEN 1 AND 4000),
  variables_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_templates_channel_name_lang_uniq
    UNIQUE (channel_id, template_name, language_code)
);
CREATE INDEX IF NOT EXISTS whatsapp_message_templates_org_status_idx
  ON public.whatsapp_message_templates (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_message_templates_channel_idx
  ON public.whatsapp_message_templates (channel_id, status);

DROP TRIGGER IF EXISTS whatsapp_message_templates_updated_at ON public.whatsapp_message_templates;
CREATE TRIGGER whatsapp_message_templates_updated_at BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Template chosen for a queued outbound event (resolved by the outbox worker).
ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS template_language_code TEXT,
  ADD COLUMN IF NOT EXISTS template_variables_json JSONB;

-- Reminder schedule: an approved template can be pinned per appointment/kind.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_template_name TEXT,
  ADD COLUMN IF NOT EXISTS reminder_template_language_code TEXT,
  ADD COLUMN IF NOT EXISTS reminder_template_variables JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_message_templates_member_select ON public.whatsapp_message_templates;
CREATE POLICY whatsapp_message_templates_member_select ON public.whatsapp_message_templates
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS whatsapp_message_templates_service ON public.whatsapp_message_templates;
CREATE POLICY whatsapp_message_templates_service ON public.whatsapp_message_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.whatsapp_message_templates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.whatsapp_message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_message_templates TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Productivity connectors: one Gmail / Google Calendar connection per user.
--    OAuth tokens are stored only as an AES-256-GCM envelope. The browser may
--    read connection metadata, never the encrypted token column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tool_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'google_calendar')),
  account_email TEXT CHECK (account_email IS NULL OR length(account_email) <= 254),
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  encrypted_tokens TEXT CHECK (encrypted_tokens IS NULL OR length(encrypted_tokens) <= 20000),
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 1000),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_tool_connections_owner_provider_uniq UNIQUE (org_id, user_id, provider)
);
CREATE INDEX IF NOT EXISTS user_tool_connections_owner_idx
  ON public.user_tool_connections (org_id, user_id, status);

DROP TRIGGER IF EXISTS user_tool_connections_updated_at ON public.user_tool_connections;
CREATE TRIGGER user_tool_connections_updated_at BEFORE UPDATE ON public.user_tool_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_tool_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tool_connections_owner_select ON public.user_tool_connections;
CREATE POLICY user_tool_connections_owner_select ON public.user_tool_connections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS user_tool_connections_service ON public.user_tool_connections;
CREATE POLICY user_tool_connections_service ON public.user_tool_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.user_tool_connections FROM PUBLIC, anon, authenticated, service_role;
-- Column-level SELECT: encrypted_tokens is deliberately not granted.
GRANT SELECT (
  id, org_id, user_id, provider, account_email, scopes, token_expires_at,
  status, last_error, connected_at, updated_at
) ON TABLE public.user_tool_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_tool_connections TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Fill-only secret vault.
--    * authenticated may read metadata rows only (no ciphertext column grant).
--    * writes and decryption happen exclusively in trusted server code.
--    * secret_ref is an opaque reference usable by the background broker; the
--      plaintext is never placed in a prompt or returned to a client.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_secret_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_ref TEXT NOT NULL UNIQUE CHECK (secret_ref ~ '^sec_[a-f0-9]{32}$'),
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  secret_kind TEXT NOT NULL DEFAULT 'other'
    CHECK (secret_kind IN ('api_key', 'token', 'password', 'other')),
  ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 1 AND 20000),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{16}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_secret_vault_owner_idx
  ON public.user_secret_vault (org_id, user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS user_secret_vault_updated_at ON public.user_secret_vault;
CREATE TRIGGER user_secret_vault_updated_at BEFORE UPDATE ON public.user_secret_vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_secret_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_secret_vault_owner_select ON public.user_secret_vault;
CREATE POLICY user_secret_vault_owner_select ON public.user_secret_vault
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS user_secret_vault_service ON public.user_secret_vault;
CREATE POLICY user_secret_vault_service ON public.user_secret_vault
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.user_secret_vault FROM PUBLIC, anon, authenticated, service_role;
-- Column-level SELECT: ciphertext is deliberately not granted to clients.
GRANT SELECT (
  id, org_id, user_id, secret_ref, label, secret_kind, fingerprint, status,
  last_used_at, created_at, updated_at
) ON TABLE public.user_secret_vault TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_secret_vault TO service_role;

-- The vault value may never be altered in place; rotate by writing a new row.
CREATE OR REPLACE FUNCTION public.user_secret_vault_immutable_value()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.ciphertext IS DISTINCT FROM OLD.ciphertext
     OR NEW.secret_ref IS DISTINCT FROM OLD.secret_ref
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'user_secret_vault values are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_secret_vault_immutable_value ON public.user_secret_vault;
CREATE TRIGGER user_secret_vault_immutable_value BEFORE UPDATE ON public.user_secret_vault
  FOR EACH ROW EXECUTE FUNCTION public.user_secret_vault_immutable_value();

REVOKE ALL ON FUNCTION public.user_secret_vault_immutable_value() FROM PUBLIC, anon, authenticated;
