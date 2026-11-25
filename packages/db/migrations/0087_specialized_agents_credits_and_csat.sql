ALTER TABLE public.organizations
  ADD COLUMN specialized_agent_kind text
    CHECK (specialized_agent_kind IN ('personal', 'business', 'freelancer', 'ops')),
  ADD COLUMN conversation_csat_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.agent_tasks ADD COLUMN specialized_agent_kind text
  CHECK (specialized_agent_kind IN ('personal', 'business', 'freelancer', 'ops'));

ALTER TABLE public.personal_assistant_settings
  ADD COLUMN ops_daily_report_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN last_ops_daily_report_local_date date;

CREATE TABLE public.org_credit_wallets (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 1000000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.org_credit_wallets(org_id) ON DELETE RESTRICT,
  task_id uuid,
  request_id uuid,
  actor_id uuid,
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_entry_kind CHECK (
    (delta < 0 AND task_id IS NOT NULL AND request_id IS NULL AND actor_id IS NULL)
    OR (delta > 0 AND task_id IS NULL AND request_id IS NOT NULL AND actor_id IS NOT NULL)
  ),
  UNIQUE (org_id, task_id),
  UNIQUE (org_id, request_id)
);
CREATE INDEX credit_ledger_entries_recent_idx ON public.credit_ledger_entries(org_id, created_at DESC, id);

ALTER TABLE public.org_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_credit_wallets_member_select ON public.org_credit_wallets
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY credit_ledger_entries_member_select ON public.credit_ledger_entries
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
REVOKE ALL ON TABLE public.org_credit_wallets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.credit_ledger_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.org_credit_wallets TO authenticated, service_role;
GRANT SELECT (id, org_id, task_id, delta, balance_after, created_at) ON TABLE public.credit_ledger_entries TO authenticated;
GRANT SELECT ON TABLE public.credit_ledger_entries TO service_role;

CREATE FUNCTION public.prevent_credit_ledger_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger_entries are append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER credit_ledger_no_rewrite BEFORE UPDATE OR DELETE ON public.credit_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_ledger_rewrite();
CREATE TRIGGER credit_ledger_no_truncate BEFORE TRUNCATE ON public.credit_ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_credit_ledger_rewrite();
REVOKE ALL ON FUNCTION public.prevent_credit_ledger_rewrite() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.consume_usage_credits(p_org_id uuid, p_task_id uuid, p_amount integer) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 OR NOT EXISTS (
    SELECT 1 FROM public.agent_tasks WHERE id = p_task_id AND org_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'invalid usage credit debit' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.org_credit_wallets(org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  PERFORM 1 FROM public.org_credit_wallets WHERE org_id = p_org_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.credit_ledger_entries WHERE org_id = p_org_id AND task_id = p_task_id) THEN
    RETURN 'already_charged';
  END IF;

  UPDATE public.org_credit_wallets SET balance = balance - p_amount, updated_at = now()
    WHERE org_id = p_org_id AND balance >= p_amount RETURNING balance INTO new_balance;
  IF NOT FOUND THEN RETURN 'insufficient'; END IF;

  INSERT INTO public.credit_ledger_entries(org_id, task_id, delta, balance_after)
    VALUES (p_org_id, p_task_id, -p_amount, new_balance);
  RETURN 'charged';
END;
$$;

CREATE FUNCTION public.grant_usage_credits(p_org_id uuid, p_request_id uuid, p_actor_id uuid, p_amount integer)
RETURNS public.credit_ledger_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_balance bigint;
  ledger_entry public.credit_ledger_entries;
BEGIN
  IF p_request_id IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 1000000 OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE id = p_actor_id AND status = 'active'
      AND (role = 'platform_owner' OR permissions ? 'billing:write')
  ) THEN
    RAISE EXCEPTION 'invalid usage credit grant' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.org_credit_wallets(org_id) VALUES (p_org_id) ON CONFLICT (org_id) DO NOTHING;
  PERFORM 1 FROM public.org_credit_wallets WHERE org_id = p_org_id FOR UPDATE;
  SELECT * INTO ledger_entry FROM public.credit_ledger_entries WHERE org_id = p_org_id AND request_id = p_request_id;
  IF FOUND THEN
    IF ledger_entry.delta <> p_amount OR ledger_entry.actor_id <> p_actor_id THEN
      RAISE EXCEPTION 'credit grant request differs from recorded grant' USING ERRCODE = '22023';
    END IF;
    RETURN ledger_entry;
  END IF;

  UPDATE public.org_credit_wallets SET balance = balance + p_amount, updated_at = now()
    WHERE org_id = p_org_id AND balance <= 1000000000 - p_amount RETURNING balance INTO new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'usage credit balance limit exceeded' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.credit_ledger_entries(org_id, request_id, actor_id, delta, balance_after)
    VALUES (p_org_id, p_request_id, p_actor_id, p_amount, new_balance) RETURNING * INTO ledger_entry;
  RETURN ledger_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_usage_credits(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_usage_credits(uuid, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.grant_usage_credits(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.conversation_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  resolved_at timestamptz NOT NULL,
  resolved_automatically boolean NOT NULL,
  survey_requested boolean NOT NULL DEFAULT false,
  rating text CHECK (rating IN ('excellent', 'good', 'needs_improvement')),
  rated_at timestamptz,
  UNIQUE (conversation_id, resolved_at),
  CHECK ((rating IS NULL) = (rated_at IS NULL)),
  CHECK (rating IS NULL OR survey_requested)
);
CREATE INDEX conversation_quality_events_report_idx ON public.conversation_quality_events(org_id, resolved_at DESC);

ALTER TABLE public.conversation_quality_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_quality_member_select ON public.conversation_quality_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY conversation_quality_service_access ON public.conversation_quality_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.conversation_quality_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.conversation_quality_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversation_quality_events TO service_role;

CREATE FUNCTION public.record_conversation_quality() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  has_agent_reply boolean;
  has_human_reply boolean;
  survey_id uuid;
  recipient_phone text;
  survey_body constant text := 'كيف تقيّم تجربتك في هذه المحادثة؟ مشاركتك اختيارية.';
BEGIN
  SELECT COALESCE(bool_or(sender_type = 'ai'), false),
    COALESCE(bool_or(sender_type IN ('human_dashboard', 'human_whatsapp') OR sender_type IS NULL), false)
  INTO has_agent_reply, has_human_reply
  FROM public.messages WHERE conversation_id = NEW.id AND direction = 'outbound';

  INSERT INTO public.conversation_quality_events(org_id, conversation_id, channel_id, resolved_at, resolved_automatically)
  VALUES (NEW.organization_id, NEW.id, NEW.channel_id, COALESCE(NEW.resolved_at, now()),
    has_agent_reply AND NOT has_human_reply AND OLD.handoff_reason IS NULL AND OLD.status <> 'handed_off')
  ON CONFLICT (conversation_id, resolved_at) DO NOTHING RETURNING id INTO survey_id;

  IF survey_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.messages WHERE conversation_id = NEW.id AND direction = 'inbound'
      AND created_at >= now() - interval '24 hours'
  ) THEN
    SELECT regexp_replace(ct.phone, '[^0-9]', '', 'g') INTO recipient_phone
    FROM public.contacts ct
    JOIN public.organizations o ON o.id = ct.organization_id
    JOIN public.channels ch ON ch.id = NEW.channel_id AND ch.organization_id = o.id
    WHERE ct.id = NEW.contact_id AND o.id = NEW.organization_id AND o.conversation_csat_enabled
      AND ch.channel_type = 'whatsapp' AND ch.is_active AND ch.connection_mode IN ('cloud_api', 'coexistence');

    IF recipient_phone ~ '^[1-9][0-9]{7,14}$' THEN
      INSERT INTO public.outbox_events(organization_id, business_id, channel_id, event_type, idempotency_key, recipient, payload)
      VALUES (NEW.organization_id, NEW.business_id, NEW.channel_id, 'conversation.csat_requested',
        'csat:' || survey_id, recipient_phone, jsonb_build_object('conversation_id', NEW.id, 'survey_id', survey_id,
          'body', survey_body, 'sender_type', 'system', 'initiated_by', 'business'));
      UPDATE public.conversation_quality_events SET survey_requested = true WHERE id = survey_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_quality_on_close AFTER UPDATE OF status ON public.conversations
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'closed')
  EXECUTE FUNCTION public.record_conversation_quality();
REVOKE ALL ON FUNCTION public.record_conversation_quality() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_conversation_rating(p_survey_id uuid, p_org_id uuid, p_channel_id uuid, p_phone text, p_rating text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_rating IS NULL OR p_rating NOT IN ('excellent', 'good', 'needs_improvement') THEN RETURN false; END IF;
  UPDATE public.conversation_quality_events q SET rating = p_rating, rated_at = now()
  WHERE q.id = p_survey_id AND q.org_id = p_org_id AND q.channel_id = p_channel_id
    AND q.survey_requested AND q.rating IS NULL AND q.resolved_at >= now() - interval '7 days'
    AND EXISTS (SELECT 1 FROM public.outbox_events e WHERE e.organization_id = q.org_id
      AND e.channel_id = q.channel_id AND e.idempotency_key = 'csat:' || q.id AND e.recipient = p_phone AND e.status = 'sent');
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.record_conversation_rating(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_conversation_rating(uuid, uuid, uuid, text, text) TO service_role;

CREATE FUNCTION public.agent_quality_summary(p_org_id uuid, p_since timestamptz DEFAULT now() - interval '30 days')
RETURNS TABLE(resolved integer, auto_resolved integer, tasks integer, tasks_completed integer, ratings integer, positive_ratings integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' AND NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'organization forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY WITH conversations AS (
    SELECT count(*)::integer AS closed, count(*) FILTER (WHERE resolved_automatically)::integer AS auto_closed,
      count(rating)::integer AS scored, count(*) FILTER (WHERE rating IN ('excellent', 'good'))::integer AS positive
    FROM public.conversation_quality_events WHERE org_id = p_org_id AND resolved_at >= p_since
  ), task_results AS (
    SELECT count(*)::integer AS finished, count(*) FILTER (WHERE state = 'done')::integer AS successful
    FROM public.agent_tasks WHERE org_id = p_org_id AND updated_at >= p_since AND state IN ('done', 'failed', 'cancelled')
  )
  SELECT closed, auto_closed, finished, successful, scored, positive FROM conversations CROSS JOIN task_results;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_quality_summary(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_quality_summary(uuid, timestamptz) TO authenticated, service_role;
