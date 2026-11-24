-- Phase 3A: personal executive agent engine.
--  * personal_assistant_links    : verified personal WhatsApp number per user (central Kayan AI bot) + kill switch
--  * personal_assistant_messages : one unified web + WhatsApp thread per user
--  * agent_tasks / agent_task_steps : executive task engine (goal -> reviewable plan -> steps)
--  * agent_approvals             : hash-locked approval gate (SHA-256 of payload_json)
--  * agent_receipts              : append-only work receipts
--
-- Privileges are granted per table only (no schema-wide REVOKE/GRANT).
-- authenticated users may only READ their own rows (user_id = auth.uid() inside an
-- organization they belong to); every write goes through server code running as
-- service_role after it has verified the owner, eligibility and the approval hash.

-- ---------------------------------------------------------------------------
-- 1. personal_assistant_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_assistant_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- International E.164 (+9677XXXXXXXX). NULL until the user activates from WhatsApp.
  whatsapp_phone TEXT CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  verification_token TEXT CHECK (verification_token IS NULL OR verification_token ~ '^[A-Z0-9]{4,12}$'),
  token_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
  kill_switch_changed_at TIMESTAMPTZ,
  language_dialect TEXT NOT NULL DEFAULT 'ar-YE' CHECK (length(language_dialect) BETWEEN 2 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_assistant_links_org_user_uniq UNIQUE (org_id, user_id)
);
-- One personal number can belong to exactly one account.
CREATE UNIQUE INDEX IF NOT EXISTS personal_assistant_links_phone_uniq
  ON public.personal_assistant_links (whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS personal_assistant_links_token_uniq
  ON public.personal_assistant_links (verification_token) WHERE verification_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. personal_assistant_messages (unified thread: web + WhatsApp)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp', 'system')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'voice', 'approval', 'receipt')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 8000),
  external_message_id TEXT,
  task_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_assistant_messages_thread_idx
  ON public.personal_assistant_messages (org_id, user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS personal_assistant_messages_external_uniq
  ON public.personal_assistant_messages (external_message_id) WHERE external_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. agent_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.personal_assistant_messages(id) ON DELETE SET NULL,
  goal TEXT NOT NULL CHECK (length(btrim(goal)) BETWEEN 1 AND 1000),
  constraints_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'planning', 'awaiting_approval', 'running', 'verifying', 'done', 'failed', 'cancelled')),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'financial')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  rollback_plan TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_tasks_owner_state_idx
  ON public.agent_tasks (org_id, user_id, state, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. agent_task_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  tool_name TEXT NOT NULL CHECK (tool_name ~ '^[a-z_]{2,64}$'),
  action_summary TEXT NOT NULL,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'financial')),
  dry_run_output TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_approval', 'running', 'done', 'failed', 'skipped', 'cancelled')),
  result_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_steps_task_index_uniq UNIQUE (task_id, step_index)
);

-- ---------------------------------------------------------------------------
-- 5. agent_approvals (hash-locked)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.agent_task_steps(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_ar TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decided_via TEXT CHECK (decided_via IS NULL OR decided_via IN ('whatsapp', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_approvals_owner_status_idx
  ON public.agent_approvals (org_id, user_id, status, created_at DESC);
-- At most one live approval per step.
CREATE UNIQUE INDEX IF NOT EXISTS agent_approvals_step_pending_uniq
  ON public.agent_approvals (step_id) WHERE status = 'pending';

-- The signed payload can never change after the approval card was issued.
CREATE OR REPLACE FUNCTION public.agent_approvals_lock_payload()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payload_json IS DISTINCT FROM OLD.payload_json
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.step_id IS DISTINCT FROM OLD.step_id THEN
    RAISE EXCEPTION 'agent_approvals payload is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'agent_approvals decision is final' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS agent_approvals_lock_payload ON public.agent_approvals;
CREATE TRIGGER agent_approvals_lock_payload BEFORE UPDATE ON public.agent_approvals
  FOR EACH ROW EXECUTE FUNCTION public.agent_approvals_lock_payload();

-- ---------------------------------------------------------------------------
-- 6. agent_receipts (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_ar TEXT NOT NULL,
  read_sources_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  untouched_scope_note TEXT NOT NULL DEFAULT '',
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_receipts_task_uniq UNIQUE (task_id)
);
CREATE INDEX IF NOT EXISTS agent_receipts_owner_idx
  ON public.agent_receipts (org_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.agent_receipts_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'agent_receipts are append-only' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS agent_receipts_immutable ON public.agent_receipts;
CREATE TRIGGER agent_receipts_immutable BEFORE UPDATE ON public.agent_receipts
  FOR EACH ROW EXECUTE FUNCTION public.agent_receipts_immutable();

-- updated_at maintenance
DROP TRIGGER IF EXISTS personal_assistant_links_updated_at ON public.personal_assistant_links;
CREATE TRIGGER personal_assistant_links_updated_at BEFORE UPDATE ON public.personal_assistant_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS agent_tasks_updated_at ON public.agent_tasks;
CREATE TRIGGER agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Transparent memory: add the "documents" category (identity=fact,
--    preferences=preference, tasks=project, relationships=contact, documents=document).
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_memories DROP CONSTRAINT IF EXISTS user_memories_category_check;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_category_check
  CHECK (category IN ('fact', 'preference', 'contact', 'project', 'document'));

-- ---------------------------------------------------------------------------
-- 8. Row Level Security — full isolation by org_id + user_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.personal_assistant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_assistant_links_owner_select ON public.personal_assistant_links;
CREATE POLICY personal_assistant_links_owner_select ON public.personal_assistant_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS personal_assistant_messages_owner_select ON public.personal_assistant_messages;
CREATE POLICY personal_assistant_messages_owner_select ON public.personal_assistant_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS agent_tasks_owner_select ON public.agent_tasks;
CREATE POLICY agent_tasks_owner_select ON public.agent_tasks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

-- Steps carry no owner columns: visible only through a task the caller owns.
DROP POLICY IF EXISTS agent_task_steps_owner_select ON public.agent_task_steps;
CREATE POLICY agent_task_steps_owner_select ON public.agent_task_steps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_tasks t
     WHERE t.id = agent_task_steps.task_id
       AND t.user_id = auth.uid()
       AND public.is_org_member(t.org_id)
  ));

DROP POLICY IF EXISTS agent_approvals_owner_select ON public.agent_approvals;
CREATE POLICY agent_approvals_owner_select ON public.agent_approvals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS agent_receipts_owner_select ON public.agent_receipts;
CREATE POLICY agent_receipts_owner_select ON public.agent_receipts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

-- Trusted server code (service_role). Explicit policies keep it working even where the
-- role was provisioned without BYPASSRLS; its reach is still capped by the grants below.
DROP POLICY IF EXISTS personal_assistant_links_service ON public.personal_assistant_links;
CREATE POLICY personal_assistant_links_service ON public.personal_assistant_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS personal_assistant_messages_service ON public.personal_assistant_messages;
CREATE POLICY personal_assistant_messages_service ON public.personal_assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_tasks_service ON public.agent_tasks;
CREATE POLICY agent_tasks_service ON public.agent_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_task_steps_service ON public.agent_task_steps;
CREATE POLICY agent_task_steps_service ON public.agent_task_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_approvals_service ON public.agent_approvals;
CREATE POLICY agent_approvals_service ON public.agent_approvals
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS agent_receipts_service ON public.agent_receipts;
CREATE POLICY agent_receipts_service ON public.agent_receipts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. Table-level privileges (new tables only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.personal_assistant_links FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.personal_assistant_messages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.agent_tasks FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.agent_task_steps FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.agent_approvals FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.agent_receipts FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.personal_assistant_links,
  public.personal_assistant_messages,
  public.agent_tasks,
  public.agent_task_steps,
  public.agent_approvals,
  public.agent_receipts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.personal_assistant_links,
  public.personal_assistant_messages,
  public.agent_tasks,
  public.agent_task_steps
TO service_role;
-- Approvals are decided, never deleted; receipts are append-only.
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_approvals TO service_role;
GRANT SELECT, INSERT ON TABLE public.agent_receipts TO service_role;

REVOKE ALL ON FUNCTION public.agent_approvals_lock_payload() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_receipts_immutable() FROM PUBLIC;
