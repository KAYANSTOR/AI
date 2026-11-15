ALTER TABLE public.business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_onboarding_step_check;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_onboarding_step_check
  CHECK (onboarding_step BETWEEN 1 AND 5);

INSERT INTO public.plans (code, name, description, monthly_price, currency, limits, is_active)
VALUES (
  'trial',
  'الباقة التجريبية',
  'استخدام مجاني لمدة شهر واحد من تاريخ التفعيل.',
  0,
  'USD',
  '{"channels": 1, "voice_minutes": 30, "ai_messages": 100, "automation_runs": 50, "campaign_sends": 50}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = 0,
  currency = 'USD',
  limits = EXCLUDED.limits,
  is_active = true,
  updated_at = now();

-- Give legacy trials without an end date a finite period, using their original start when available.
UPDATE public.subscriptions
SET trial_start = COALESCE(trial_start, now()),
    trial_end = COALESCE(trial_end, COALESCE(trial_start, now()) + interval '1 month'),
    current_period_start = COALESCE(current_period_start, trial_start, now()),
    current_period_end = COALESCE(current_period_end, COALESCE(trial_end, now() + interval '1 month'))
WHERE status = 'trial'
  AND trial_end IS NULL;

-- Existing organizations without a subscription receive one finite month from migration time.
INSERT INTO public.subscriptions (
  organization_id,
  plan_id,
  status,
  trial_start,
  trial_end,
  current_period_start,
  current_period_end
)
SELECT
  org.id,
  trial.id,
  'trial',
  now(),
  now() + interval '1 month',
  now(),
  now() + interval '1 month'
FROM public.organizations AS org
CROSS JOIN public.plans AS trial
WHERE trial.code = 'trial'
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions AS sub
    WHERE sub.organization_id = org.id
  );
