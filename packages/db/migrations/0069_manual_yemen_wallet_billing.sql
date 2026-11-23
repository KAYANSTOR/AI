-- Manual Yemeni wallet transfer flow. This is additive and does not change the
-- existing Esaalat provider flow or touch live data until the migration is applied.
CREATE TABLE IF NOT EXISTS public.manual_yemen_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_code VARCHAR(30) NOT NULL CHECK (provider_code IN ('jawali', 'jeeb', 'onecash', 'kuraimi', 'other')),
  display_name VARCHAR(120) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  account_number VARCHAR(80) NOT NULL,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_code, account_number)
);
ALTER TABLE public.manual_yemen_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_yemen_wallets_active_select ON public.manual_yemen_wallets;
CREATE POLICY manual_yemen_wallets_active_select
  ON public.manual_yemen_wallets FOR SELECT TO authenticated USING (is_active = true);
GRANT SELECT ON public.manual_yemen_wallets TO authenticated;
GRANT ALL ON public.manual_yemen_wallets TO service_role;

CREATE TABLE IF NOT EXISTS public.manual_wallet_payment_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  plan_code VARCHAR(50) NOT NULL CHECK (plan_code IN ('starter', 'growth', 'pro')),
  billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  wallet_id UUID NOT NULL REFERENCES public.manual_yemen_wallets(id),
  amount_usd NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  amount_yer BIGINT NOT NULL CHECK (amount_yer > 0),
  exchange_rate NUMERIC(18,6) NOT NULL CHECK (exchange_rate > 0),
  sender_name VARCHAR(160) NOT NULL,
  transfer_reference VARCHAR(128) NOT NULL,
  receipt_mime_type VARCHAR(50) NOT NULL CHECK (receipt_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  receipt_image_base64 TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by VARCHAR(160),
  reviewed_at TIMESTAMPTZ,
  idempotency_key UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_wallet_requests_status_created
  ON public.manual_wallet_payment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_wallet_requests_org_created
  ON public.manual_wallet_payment_requests(organization_id, created_at DESC);
ALTER TABLE public.manual_wallet_payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_wallet_requests_select ON public.manual_wallet_payment_requests;
DROP POLICY IF EXISTS manual_wallet_requests_insert ON public.manual_wallet_payment_requests;
REVOKE ALL ON public.manual_wallet_payment_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.manual_wallet_payment_requests TO service_role;

CREATE OR REPLACE FUNCTION public.review_manual_wallet_payment(
  p_request_id UUID,
  p_action TEXT,
  p_reviewed_by TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_row public.manual_wallet_payment_requests%ROWTYPE;
  next_period_end TIMESTAMPTZ;
  plan_limits JSONB;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_review_action';
  END IF;

  SELECT * INTO payment_row
    FROM public.manual_wallet_payment_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF payment_row.status <> 'pending' THEN RETURN 'already_' || payment_row.status; END IF;

  IF p_action = 'approve' THEN
    SELECT limits INTO plan_limits FROM public.plans WHERE id = payment_row.plan_id AND is_active = true;
    IF plan_limits IS NULL THEN RAISE EXCEPTION 'plan_not_active'; END IF;
    next_period_end := CASE
      WHEN payment_row.billing_cycle = 'yearly' THEN now() + interval '1 year'
      ELSE now() + interval '1 month'
    END;

    UPDATE public.manual_wallet_payment_requests
       SET status = 'approved', reviewed_by = p_reviewed_by,
           review_note = NULLIF(p_review_note, ''), reviewed_at = now(), updated_at = now()
     WHERE id = payment_row.id;

    INSERT INTO public.subscriptions (
      organization_id, plan_id, plan_tier, status, billing_cycle,
      period_start, period_end, current_period_start, current_period_end, updated_at
    ) VALUES (
      payment_row.organization_id, payment_row.plan_id, payment_row.plan_code, 'active',
      payment_row.billing_cycle, now(), next_period_end, now(), next_period_end, now()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      plan_tier = EXCLUDED.plan_tier,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now();

    INSERT INTO public.billing_entitlements(organization_id, feature_key, limit_value, period, enabled, source)
    SELECT payment_row.organization_id, item.key, NULLIF(item.value, '')::numeric, 'monthly', true, 'plan'
      FROM jsonb_each_text(plan_limits) AS item(key, value)
    ON CONFLICT (organization_id, feature_key) DO UPDATE SET
      limit_value = EXCLUDED.limit_value, period = EXCLUDED.period,
      enabled = EXCLUDED.enabled, source = 'plan', updated_at = now();

    IF plan_limits ? 'ai_messages' THEN
      INSERT INTO public.billing_entitlements(organization_id, feature_key, limit_value, period, enabled, source)
      VALUES (payment_row.organization_id, 'ai_messages_monthly', (plan_limits->>'ai_messages')::numeric, 'monthly', true, 'plan')
      ON CONFLICT (organization_id, feature_key) DO UPDATE SET
        limit_value = EXCLUDED.limit_value, period = EXCLUDED.period,
        enabled = EXCLUDED.enabled, source = 'plan', updated_at = now();
    END IF;

    INSERT INTO public.notifications (
      organization_id, entity_type, entity_id, notification_type, title, body, idempotency_key
    ) VALUES (
      payment_row.organization_id, 'manual_wallet_payment', payment_row.id, 'high_priority',
      'تم اعتماد دفعة المحفظة', 'تم اعتماد التحويل وتفعيل الاشتراك.',
      'manual-wallet-approved:' || payment_row.id::text
    ) ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

    INSERT INTO public.audit_events (
      organization_id, actor_type, action, entity_type, entity_id, metadata
    ) VALUES (
      payment_row.organization_id, 'system', 'subscription.manual_wallet_payment_approved',
      'manual_wallet_payment_request', payment_row.id,
      jsonb_build_object('plan_code', payment_row.plan_code, 'billing_cycle', payment_row.billing_cycle,
        'amount_yer', payment_row.amount_yer, 'transfer_reference', payment_row.transfer_reference,
        'reviewed_by', p_reviewed_by)
    );
    RETURN 'approved';
  END IF;

  UPDATE public.manual_wallet_payment_requests
     SET status = 'rejected', reviewed_by = p_reviewed_by,
         review_note = NULLIF(p_review_note, ''), reviewed_at = now(), updated_at = now()
   WHERE id = payment_row.id;

  INSERT INTO public.notifications (
    organization_id, entity_type, entity_id, notification_type, title, body, idempotency_key
  ) VALUES (
    payment_row.organization_id, 'manual_wallet_payment', payment_row.id, 'high_priority',
    'تعذر اعتماد دفعة المحفظة', COALESCE(NULLIF(p_review_note, ''), 'يرجى التواصل مع الدعم لمعرفة التفاصيل.'),
    'manual-wallet-rejected:' || payment_row.id::text
  ) ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  INSERT INTO public.audit_events (
    organization_id, actor_type, action, entity_type, entity_id, metadata
  ) VALUES (
    payment_row.organization_id, 'system', 'subscription.manual_wallet_payment_rejected',
    'manual_wallet_payment_request', payment_row.id,
    jsonb_build_object('plan_code', payment_row.plan_code, 'amount_yer', payment_row.amount_yer,
      'transfer_reference', payment_row.transfer_reference, 'reason', p_review_note,
      'reviewed_by', p_reviewed_by)
  );
  RETURN 'rejected';
END;
$$;

REVOKE ALL ON FUNCTION public.review_manual_wallet_payment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_manual_wallet_payment(UUID, TEXT, TEXT, TEXT) TO service_role;
