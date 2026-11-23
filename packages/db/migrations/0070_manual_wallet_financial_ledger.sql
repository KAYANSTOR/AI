-- Append-only finance ledger for manually reviewed Yemeni wallet transfers.
-- Applying this migration is a separate deployment operation; it is not run here.
CREATE TABLE IF NOT EXISTS public.billing_ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_request_id UUID NOT NULL UNIQUE REFERENCES public.manual_wallet_payment_requests(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES public.manual_yemen_wallets(id) ON DELETE RESTRICT,
  entry_type VARCHAR(40) NOT NULL DEFAULT 'subscription_payment' CHECK (entry_type = 'subscription_payment'),
  status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
  currency VARCHAR(3) NOT NULL DEFAULT 'YER' CHECK (currency = 'YER'),
  amount_yer BIGINT NOT NULL CHECK (amount_yer > 0),
  amount_usd NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  exchange_rate NUMERIC(18,6) NOT NULL CHECK (exchange_rate > 0),
  provider_code VARCHAR(30) NOT NULL,
  sender_name VARCHAR(160) NOT NULL,
  transfer_reference VARCHAR(128) NOT NULL,
  recorded_by VARCHAR(160) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_org_recorded
  ON public.billing_ledger_entries(organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_recorded
  ON public.billing_ledger_entries(recorded_at DESC);
ALTER TABLE public.billing_ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_ledger_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.billing_ledger_entries TO service_role;

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
  wallet_provider_code VARCHAR(30);
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
    SELECT provider_code INTO wallet_provider_code FROM public.manual_yemen_wallets WHERE id = payment_row.wallet_id;
    IF wallet_provider_code IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
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

    INSERT INTO public.billing_ledger_entries (
      organization_id, payment_request_id, plan_id, wallet_id, amount_yer, amount_usd,
      exchange_rate, provider_code, sender_name, transfer_reference, recorded_by, metadata
    ) VALUES (
      payment_row.organization_id, payment_row.id, payment_row.plan_id, payment_row.wallet_id,
      payment_row.amount_yer, payment_row.amount_usd, payment_row.exchange_rate,
      wallet_provider_code, payment_row.sender_name, payment_row.transfer_reference,
      COALESCE(NULLIF(p_reviewed_by, ''), 'Kayan AI Admin'),
      jsonb_build_object('plan_code', payment_row.plan_code, 'billing_cycle', payment_row.billing_cycle)
    ) ON CONFLICT (payment_request_id) DO NOTHING;

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
