-- 0021_commercial_intelligence.sql

-- 1. Plans & Entitlements
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'trial', 'starter', 'pro', 'enterprise'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    limits JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g., {"channels": 1, "voice_minutes": 100, "ai_messages": 1000}
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status VARCHAR(50) NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled')),
    billing_cycle VARCHAR(50) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Existing installations used the original subscriptions shape. Keep it intact and add the
-- commercial-intelligence fields incrementally so the migration is safe to replay.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50) DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP WITH TIME ZONE;

-- 3. Meters / Usage Tracking (Monthly reset)
CREATE TABLE usage_meters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    meter_key VARCHAR(50) NOT NULL, -- 'ai_messages', 'voice_minutes', 'automation_runs', 'campaign_sends'
    consumed_value INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, period_start, meter_key)
);

-- 4. Analytics Materialized Views / Aggregate Tables
CREATE TABLE daily_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Metrics
    new_conversations INT NOT NULL DEFAULT 0,
    resolved_conversations INT NOT NULL DEFAULT 0,
    handoff_count INT NOT NULL DEFAULT 0,
    ai_handled_count INT NOT NULL DEFAULT 0,
    
    avg_response_time_seconds INT,
    avg_resolution_time_seconds INT,
    
    new_leads INT NOT NULL DEFAULT 0,
    appointments_created INT NOT NULL DEFAULT 0,
    quotes_created INT NOT NULL DEFAULT 0,
    quotes_accepted INT NOT NULL DEFAULT 0,
    orders_created INT NOT NULL DEFAULT 0,
    orders_completed INT NOT NULL DEFAULT 0,
    
    total_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, business_id, date)
);

-- RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active plans" ON plans FOR SELECT USING (is_active = true);
CREATE POLICY "Users can read their own subscriptions" ON subscriptions FOR SELECT USING (organization_id IN (SELECT get_user_organizations()));
CREATE POLICY "Users can read their own usage" ON usage_meters FOR SELECT USING (organization_id IN (SELECT get_user_organizations()));
CREATE POLICY "Users can read their own analytics" ON daily_analytics FOR SELECT USING (organization_id IN (SELECT get_user_organizations()));

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_plans BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER set_updated_at_subscriptions BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
CREATE TRIGGER set_updated_at_usage_meters BEFORE UPDATE ON usage_meters FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Seed Default Plans
INSERT INTO plans (code, name, description, monthly_price, currency, limits) VALUES 
('trial', 'Trial', '14-day free trial', 0, 'SAR', '{"channels": 1, "voice_minutes": 30, "ai_messages": 100}'),
('starter', 'Starter', 'For small businesses', 199, 'SAR', '{"channels": 2, "voice_minutes": 100, "ai_messages": 1000}'),
('pro', 'Pro', 'For growing teams', 499, 'SAR', '{"channels": 5, "voice_minutes": 500, "ai_messages": 5000}')
ON CONFLICT (code) DO NOTHING;
