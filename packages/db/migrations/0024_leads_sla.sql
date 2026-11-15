-- 0024_leads_sla.sql
-- Enrich leads for pipeline operations and add SLA tracking on conversations.

-- ==========================================
-- 1. LEADS PIPELINE FIELDS
-- ==========================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source VARCHAR(80),
  ADD COLUMN IF NOT EXISTS source_channel VARCHAR(40),
  ADD COLUMN IF NOT EXISTS qualification_notes TEXT,
  ADD COLUMN IF NOT EXISTS next_action VARCHAR(255),
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL;

-- Keep assigned_to for compatibility; owner_member_id is the explicit pipeline owner.
CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(organization_id, owner_member_id)
  WHERE owner_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(organization_id, status, updated_at DESC);

-- ==========================================
-- 2. SLA ON CONVERSATIONS
-- ==========================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS sla_state VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_sla_state_check'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_sla_state_check
      CHECK (sla_state IN ('normal', 'at_risk', 'breached', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_sla
  ON conversations(organization_id, sla_state, first_response_due_at)
  WHERE sla_state IN ('normal', 'at_risk', 'breached');

-- ==========================================
-- 3. ORG SLA POLICY (defaults)
-- ==========================================
CREATE TABLE IF NOT EXISTS sla_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL DEFAULT 'default',
  first_response_minutes INTEGER NOT NULL DEFAULT 15,
  resolution_minutes INTEGER NOT NULL DEFAULT 1440,
  warning_ratio NUMERIC(4,2) NOT NULL DEFAULT 0.75,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sla_policies_select ON sla_policies;
CREATE POLICY sla_policies_select ON sla_policies FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS sla_policies_admin ON sla_policies;
CREATE POLICY sla_policies_admin ON sla_policies FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
