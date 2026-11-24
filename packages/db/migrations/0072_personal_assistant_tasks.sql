-- Personal assistant tasks, delivery preferences, and durable extraction queue.
-- Personal-assistant records are scoped to both the organization and the authenticated user.

CREATE TABLE IF NOT EXISTS public.personal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 300),
  notes TEXT,
  due_at TIMESTAMPTZ,
  recurrence_rule TEXT CHECK (recurrence_rule IS NULL OR length(recurrence_rule) <= 255),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'snoozed')),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS personal_tasks_owner_due_idx
  ON public.personal_tasks (organization_id, user_id, due_at)
  WHERE status IN ('pending', 'snoozed') AND due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS personal_tasks_owner_status_idx
  ON public.personal_tasks (organization_id, user_id, status, created_at DESC);
DROP TRIGGER IF EXISTS personal_tasks_updated_at ON public.personal_tasks;
CREATE TRIGGER personal_tasks_updated_at BEFORE UPDATE ON public.personal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.personal_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_tasks_select ON public.personal_tasks;
CREATE POLICY personal_tasks_select ON public.personal_tasks FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_tasks_insert ON public.personal_tasks;
CREATE POLICY personal_tasks_insert ON public.personal_tasks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_tasks_update ON public.personal_tasks;
CREATE POLICY personal_tasks_update ON public.personal_tasks FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_tasks_delete ON public.personal_tasks;
CREATE POLICY personal_tasks_delete ON public.personal_tasks FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_tasks TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.personal_assistant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  whatsapp_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  morning_brief_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  morning_brief_local_time TIME NOT NULL DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  last_morning_brief_local_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT personal_assistant_settings_org_user_uniq UNIQUE (organization_id, user_id)
);
ALTER TABLE public.personal_assistant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_assistant_settings_select ON public.personal_assistant_settings;
CREATE POLICY personal_assistant_settings_select ON public.personal_assistant_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_assistant_settings_insert ON public.personal_assistant_settings;
CREATE POLICY personal_assistant_settings_insert ON public.personal_assistant_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_assistant_settings_update ON public.personal_assistant_settings;
CREATE POLICY personal_assistant_settings_update ON public.personal_assistant_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP POLICY IF EXISTS personal_assistant_settings_delete ON public.personal_assistant_settings;
CREATE POLICY personal_assistant_settings_delete ON public.personal_assistant_settings FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
DROP TRIGGER IF EXISTS personal_assistant_settings_updated_at ON public.personal_assistant_settings;
CREATE TRIGGER personal_assistant_settings_updated_at BEFORE UPDATE ON public.personal_assistant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_assistant_settings TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.personal_assistant_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT personal_assistant_extraction_source_uniq UNIQUE (organization_id, source_message_id)
);
CREATE INDEX IF NOT EXISTS personal_assistant_extraction_pending_idx
  ON public.personal_assistant_extraction_jobs (created_at, id)
  WHERE status IN ('pending', 'failed');
ALTER TABLE public.personal_assistant_extraction_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_assistant_extraction_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_assistant_extraction_jobs TO service_role;
