-- Central PostgreSQL control plane for the owner console and billing extensions.
-- Additive only: do not execute manually in production; apply through the migration runner.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 320),
  full_name TEXT NOT NULL DEFAULT 'Platform Owner',
  role TEXT NOT NULL DEFAULT 'platform_owner' CHECK (role IN ('platform_owner', 'super_admin', 'ops_auditor')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  password_hash TEXT NOT NULL,
  mfa_secret_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_active ON public.platform_admin_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.platform_admin_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_login_attempts_rate ON public.platform_admin_login_attempts(ip_address, created_at DESC) WHERE success = false;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_created ON public.platform_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount NUMERIC(14, 4) NOT NULL CHECK (amount >= 0),
  exchange_rate_to_usd NUMERIC(18, 8) CHECK (exchange_rate_to_usd IS NULL OR exchange_rate_to_usd > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, billing_cycle, currency)
);
CREATE INDEX IF NOT EXISTS idx_plan_prices_catalog ON public.plan_prices(plan_id, is_active, currency);

CREATE TABLE IF NOT EXISTS public.billing_payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('manual_wallet', 'international', 'local_gateway', 'other')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS personal_assistant_addon_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_assistant_addon_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS personal_assistant_addon_updated_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_providers ENABLE ROW LEVEL SECURITY;

-- Scope revokes to these newly introduced tables only. Existing public tables are untouched.
REVOKE ALL ON TABLE public.platform_admins, public.platform_admin_sessions,
  public.platform_admin_login_attempts, public.platform_settings,
  public.platform_audit_logs, public.billing_payment_providers
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.plan_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.plan_prices TO anon, authenticated;
GRANT ALL ON TABLE public.platform_admins, public.platform_admin_sessions,
  public.platform_admin_login_attempts, public.platform_settings,
  public.platform_audit_logs, public.plan_prices, public.billing_payment_providers
  TO service_role;

DROP POLICY IF EXISTS plan_prices_active_select ON public.plan_prices;
CREATE POLICY plan_prices_active_select ON public.plan_prices
  FOR SELECT TO anon, authenticated USING (is_active = true);
