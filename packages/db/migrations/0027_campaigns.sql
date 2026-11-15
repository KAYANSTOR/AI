-- 0027_campaigns.sql
-- Phase 3.4 campaign foundation: definition, audience snapshot, per-recipient sends.

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  channel VARCHAR(40) NOT NULL DEFAULT 'whatsapp',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  segment_id UUID REFERENCES segments(id) ON DELETE SET NULL,
  template_body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30,
  require_consent BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_status
  ON campaigns(organization_id, status, scheduled_at);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select ON campaigns;
CREATE POLICY campaigns_select ON campaigns FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS campaigns_write ON campaigns;
CREATE POLICY campaigns_write ON campaigns FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'skipped', 'failed')),
  skip_reason VARCHAR(120),
  recipient_address VARCHAR(255),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_due
  ON campaign_recipients(campaign_id, status)
  WHERE status = 'pending';

ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_recipients_select ON campaign_recipients;
CREATE POLICY campaign_recipients_select ON campaign_recipients FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
