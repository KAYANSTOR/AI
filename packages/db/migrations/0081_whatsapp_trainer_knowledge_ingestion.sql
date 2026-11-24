-- Phase 3B: «مدرب كيان» — WhatsApp trainer and knowledge ingestion.
--  * whatsapp_trainer_links          : verified owner/admin phone per (org, user) + 30-minute training session
--  * whatsapp_training_submissions   : Extract -> Preview -> Confirm -> Index drafts (text/voice/image/document)
--
-- Privileges are granted per table only (no schema-wide REVOKE/GRANT).
-- authenticated users may only READ rows of an organization they administer (owner/admin);
-- personal-memory drafts are visible to their own author only. Every write goes through
-- server code running as service_role after it verified the member role, the plan limit
-- and (for approvals) the SHA-256 payload hash.

-- ---------------------------------------------------------------------------
-- 1. whatsapp_trainer_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_trainer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_phone TEXT CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  verification_token TEXT CHECK (verification_token IS NULL OR verification_token ~ '^[A-Z0-9]{4,12}$'),
  token_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  -- Training mode on the central number: active while now() < session_expires_at (sliding 30 min).
  session_expires_at TIMESTAMPTZ,
  awaiting_edit_submission_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_trainer_links_org_user_uniq UNIQUE (org_id, user_id)
);
-- A phone trains exactly one organization at a time.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_trainer_links_phone_uniq
  ON public.whatsapp_trainer_links (whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_trainer_links_token_uniq
  ON public.whatsapp_trainer_links (verification_token) WHERE verification_token IS NOT NULL;

DROP TRIGGER IF EXISTS whatsapp_trainer_links_updated_at ON public.whatsapp_trainer_links;
CREATE TRIGGER whatsapp_trainer_links_updated_at
  BEFORE UPDATE ON public.whatsapp_trainer_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. whatsapp_training_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_training_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp_central', 'whatsapp_trainer', 'web')),
  input_type TEXT NOT NULL CHECK (input_type IN ('text', 'voice', 'image', 'document')),
  -- knowledge = organization RAG base; memory = the author's personal user_memories.
  target TEXT NOT NULL CHECK (target IN ('knowledge', 'memory')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'indexed', 'cancelled', 'failed')),
  external_message_id TEXT,
  source_excerpt TEXT NOT NULL DEFAULT '' CHECK (length(source_excerpt) <= 2000),
  media_mime TEXT CHECK (media_mime IS NULL OR length(media_mime) <= 120),
  file_name TEXT CHECK (file_name IS NULL OR length(file_name) <= 200),
  draft JSONB NOT NULL CHECK (jsonb_typeof(draft) = 'object' AND octet_length(draft::text) <= 65536),
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  checklist_key TEXT CHECK (checklist_key IS NULL OR checklist_key ~ '^[a-z_]{2,40}$'),
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  indexed_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  decided_by UUID,
  decided_via TEXT CHECK (decided_via IS NULL OR decided_via IN ('whatsapp', 'web')),
  decided_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_training_submissions_org_idx
  ON public.whatsapp_training_submissions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_training_submissions_readiness_idx
  ON public.whatsapp_training_submissions (org_id, status, checklist_key);
-- Meta redelivers webhooks: one draft per WhatsApp message.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_training_submissions_external_uniq
  ON public.whatsapp_training_submissions (external_message_id) WHERE external_message_id IS NOT NULL;

-- Decided drafts are frozen; only legal status transitions are allowed.
CREATE OR REPLACE FUNCTION public.whatsapp_training_submissions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.target IS DISTINCT FROM OLD.target OR NEW.input_type IS DISTINCT FROM OLD.input_type THEN
    RAISE EXCEPTION 'training submission ownership is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'pending' AND (NEW.draft IS DISTINCT FROM OLD.draft OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash) THEN
    RAISE EXCEPTION 'decided training draft is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('indexing', 'cancelled'))
    OR (OLD.status = 'indexing' AND NEW.status IN ('indexed', 'failed'))
  ) THEN
    RAISE EXCEPTION 'illegal training status transition % -> %', OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_training_submissions_guard ON public.whatsapp_training_submissions;
CREATE TRIGGER whatsapp_training_submissions_guard
  BEFORE UPDATE ON public.whatsapp_training_submissions
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_training_submissions_guard();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — isolation by org_id (+ user_id for personal memory)
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_trainer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_training_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_trainer_links_owner_select ON public.whatsapp_trainer_links;
CREATE POLICY whatsapp_trainer_links_owner_select ON public.whatsapp_trainer_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_admin(org_id));

DROP POLICY IF EXISTS whatsapp_training_submissions_admin_select ON public.whatsapp_training_submissions;
CREATE POLICY whatsapp_training_submissions_admin_select ON public.whatsapp_training_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(org_id)
    AND (target = 'knowledge' OR user_id = auth.uid())
  );

-- Trusted server code (service_role); its reach is capped by the grants below.
DROP POLICY IF EXISTS whatsapp_trainer_links_service ON public.whatsapp_trainer_links;
CREATE POLICY whatsapp_trainer_links_service ON public.whatsapp_trainer_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS whatsapp_training_submissions_service ON public.whatsapp_training_submissions;
CREATE POLICY whatsapp_training_submissions_service ON public.whatsapp_training_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Table-level privileges (new tables only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.whatsapp_trainer_links FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.whatsapp_training_submissions FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.whatsapp_trainer_links, public.whatsapp_training_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_trainer_links TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_training_submissions TO service_role;

REVOKE ALL ON FUNCTION public.whatsapp_training_submissions_guard() FROM PUBLIC;
