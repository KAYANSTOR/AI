-- Align the KAYAN plan catalogue with the public USD prices and add verified
-- Yemeni-wallet subscription payments through the Esaalat merchant API.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier IN ('trial', 'starter', 'growth', 'pro'));

INSERT INTO plans (code, name, description, monthly_price, currency, limits, is_active)
VALUES
  ('trial', 'Free', 'Free KAYAN AI plan', 0, 'USD',
    '{"channels":1,"voice_minutes":30,"ai_messages":100,"automation_runs":50,"campaign_sends":50}'::jsonb, TRUE),
  ('starter', 'Starter', 'KAYAN AI Starter plan', 9, 'USD',
    '{"channels":2,"voice_minutes":100,"ai_messages":1000,"automation_runs":200,"campaign_sends":200}'::jsonb, TRUE),
  ('growth', 'Pro', 'KAYAN AI Pro plan', 29, 'USD',
    '{"channels":5,"voice_minutes":500,"ai_messages":5000,"automation_runs":1000,"campaign_sends":2000}'::jsonb, TRUE),
  ('pro', 'Business', 'KAYAN AI Business plan', 59, 'USD',
    '{"channels":10,"voice_minutes":2000,"ai_messages":20000,"automation_runs":5000,"campaign_sends":10000}'::jsonb, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  currency = EXCLUDED.currency,
  limits = EXCLUDED.limits,
  is_active = TRUE,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS billing_payment_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  plan_code VARCHAR(50) NOT NULL CHECK (plan_code IN ('starter', 'growth', 'pro')),
  billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount_usd NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  amount_yer BIGINT NOT NULL CHECK (amount_yer > 0),
  exchange_rate NUMERIC(18,6) NOT NULL CHECK (exchange_rate > 0),
  provider VARCHAR(30) NOT NULL DEFAULT 'esaalat' CHECK (provider = 'esaalat'),
  wallet_id UUID NOT NULL,
  external_order_id VARCHAR(128) NOT NULL UNIQUE,
  provider_intent_id UUID UNIQUE,
  provider_payment_id VARCHAR(120),
  payment_reference VARCHAR(128),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'wrong_amount', 'expired', 'cancelled', 'failed')),
  failure_code VARCHAR(80),
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_intents_org_created
  ON billing_payment_intents(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_payment_intents_status
  ON billing_payment_intents(status, expires_at);

ALTER TABLE billing_payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_payment_intents_select ON billing_payment_intents;
CREATE POLICY billing_payment_intents_select
  ON billing_payment_intents FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.apply_verified_yemeni_wallet_payment(
  p_external_order_id TEXT,
  p_provider_intent_id TEXT,
  p_payment_id TEXT,
  p_wallet_id TEXT,
  p_amount_yer BIGINT,
  p_currency TEXT,
  p_reference TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_row billing_payment_intents%ROWTYPE;
  period_end_value TIMESTAMPTZ;
BEGIN
  SELECT * INTO payment_row
  FROM billing_payment_intents
  WHERE external_order_id = p_external_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF payment_row.status = 'verified' THEN
    RETURN 'duplicate';
  END IF;

  IF payment_row.status <> 'pending' THEN
    RETURN 'not_pending';
  END IF;

  IF payment_row.provider_intent_id IS NULL
     OR payment_row.provider_intent_id::TEXT <> p_provider_intent_id THEN
    RETURN 'intent_mismatch';
  END IF;

  IF payment_row.wallet_id::TEXT <> p_wallet_id OR p_currency <> 'YER' THEN
    UPDATE billing_payment_intents
    SET status = 'failed',
        failure_code = 'wallet_or_currency_mismatch',
        updated_at = NOW()
    WHERE id = payment_row.id;
    RETURN 'rejected';
  END IF;

  IF payment_row.amount_yer <> p_amount_yer THEN
    UPDATE billing_payment_intents
    SET status = 'wrong_amount',
        provider_payment_id = p_payment_id,
        payment_reference = p_reference,
        failure_code = 'amount_mismatch',
        updated_at = NOW()
    WHERE id = payment_row.id;
    RETURN 'wrong_amount';
  END IF;

  period_end_value := CASE
    WHEN payment_row.billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 year'
    ELSE NOW() + INTERVAL '1 month'
  END;

  INSERT INTO subscriptions (
    organization_id,
    plan_id,
    plan_tier,
    status,
    billing_cycle,
    period_start,
    period_end,
    current_period_start,
    current_period_end,
    updated_at
  )
  VALUES (
    payment_row.organization_id,
    payment_row.plan_id,
    payment_row.plan_code,
    'active',
    payment_row.billing_cycle,
    NOW(),
    period_end_value,
    NOW(),
    period_end_value,
    NOW()
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
    updated_at = NOW();

  UPDATE billing_payment_intents
  SET status = 'verified',
      provider_payment_id = p_payment_id,
      payment_reference = p_reference,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE id = payment_row.id;

  INSERT INTO audit_events (
    organization_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    payment_row.organization_id,
    'system',
    'subscription.wallet_payment_verified',
    'billing_payment_intent',
    payment_row.id,
    jsonb_build_object(
      'plan_code', payment_row.plan_code,
      'billing_cycle', payment_row.billing_cycle,
      'amount_yer', payment_row.amount_yer,
      'provider_payment_id', p_payment_id
    )
  );

  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_yemeni_wallet_payment(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_yemeni_wallet_payment(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT)
  TO service_role;
