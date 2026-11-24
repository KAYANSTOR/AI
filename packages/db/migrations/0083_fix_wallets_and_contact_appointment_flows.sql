-- 0083: Yemeni wallets visible in /dashboard/billing, a default YER exchange rate,
-- Kak Bank provider, and a larger WhatsApp output budget for the free plan.
-- Scoped grants/policies only (no schema-wide revokes). Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Single wallets table: owner-console writes and /dashboard/billing reads
--    public.manual_yemen_wallets. Allow the Kak Bank provider code.
-- ---------------------------------------------------------------------------
ALTER TABLE public.manual_yemen_wallets DROP CONSTRAINT IF EXISTS manual_yemen_wallets_provider_code_check;
ALTER TABLE public.manual_yemen_wallets ADD CONSTRAINT manual_yemen_wallets_provider_code_check
  CHECK (provider_code IN ('jawali', 'jeeb', 'onecash', 'kuraimi', 'cacbank', 'other'));
ALTER TABLE public.manual_yemen_wallets ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;

-- ---------------------------------------------------------------------------
-- 2. RLS: signed-in members read active wallets only; writes stay service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.manual_yemen_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manual_yemen_wallets_active_select ON public.manual_yemen_wallets;
CREATE POLICY manual_yemen_wallets_active_select
  ON public.manual_yemen_wallets FOR SELECT TO authenticated USING (is_active = true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.manual_yemen_wallets FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.manual_yemen_wallets FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.manual_yemen_wallets TO authenticated;
GRANT ALL ON TABLE public.manual_yemen_wallets TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Default wallets (editable from owner-console). Seeded only when the provider
--    has no wallet yet; the PENDING account number is shown as "قيد التحديث" and
--    blocks submission until the owner enters the real number.
-- ---------------------------------------------------------------------------
INSERT INTO public.manual_yemen_wallets (provider_code, display_name, account_name, account_number, instructions, is_active, sort_order)
SELECT seed.provider_code, seed.display_name, 'كيان AI', 'PENDING-' || seed.provider_code,
       'حوّل المبلغ المتوقع ثم أرفق صورة الإيصال ومرجع التحويل.', true, seed.sort_order
FROM (VALUES
  ('jeeb', 'جيب', 1),
  ('onecash', 'ون كاش', 2),
  ('cacbank', 'كاك بنك', 3),
  ('jawali', 'جوالي', 4),
  ('kuraimi', 'الكريمي', 5)
) AS seed(provider_code, display_name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.manual_yemen_wallets w WHERE w.provider_code = seed.provider_code
)
ON CONFLICT (provider_code, account_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Default YER/USD rate used when no YER plan price exists (owner-console → Settings).
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES ('billing.yer_per_usd', jsonb_build_object('value', 535, 'category', 'billing',
        'description', 'سعر صرف الدولار بالريال اليمني لحساب مبلغ التحويل اليدوي'), now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. WhatsApp replies no longer truncated: free-plan output budget 180 → 350.
-- ---------------------------------------------------------------------------
UPDATE public.plans
SET limits = limits || jsonb_build_object('max_output_tokens', 350), updated_at = now()
WHERE code = 'trial' AND COALESCE((limits->>'max_output_tokens')::int, 0) < 350;
