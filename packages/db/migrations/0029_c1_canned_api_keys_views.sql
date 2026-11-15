-- 0029_c1_canned_api_keys_views.sql
-- Tier C1 foundation: canned replies, org API keys, saved inbox views, escalation policies.

CREATE TABLE IF NOT EXISTS canned_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  shortcut VARCHAR(40),
  channel VARCHAR(40),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canned_replies_org
  ON canned_replies(organization_id) WHERE is_active;

ALTER TABLE canned_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canned_replies_select ON canned_replies;
CREATE POLICY canned_replies_select ON canned_replies FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS canned_replies_write ON canned_replies;
CREATE POLICY canned_replies_write ON canned_replies FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- API keys: store only hash + prefix; plaintext shown once at creation.
CREATE TABLE IF NOT EXISTS organization_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(128) NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key_prefix)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_active
  ON organization_api_keys(organization_id)
  WHERE revoked_at IS NULL;

ALTER TABLE organization_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_select ON organization_api_keys;
CREATE POLICY api_keys_select ON organization_api_keys FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS api_keys_write ON organization_api_keys;
CREATE POLICY api_keys_write ON organization_api_keys FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE TABLE IF NOT EXISTS saved_inbox_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES organization_members(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_inbox_views_org
  ON saved_inbox_views(organization_id, member_id);

ALTER TABLE saved_inbox_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_inbox_views_select ON saved_inbox_views;
CREATE POLICY saved_inbox_views_select ON saved_inbox_views FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (is_shared OR member_id IS NULL OR member_id IN (
      SELECT id FROM organization_members WHERE user_id = auth.uid() AND organization_id = saved_inbox_views.organization_id
    ))
  );

DROP POLICY IF EXISTS saved_inbox_views_write ON saved_inbox_views;
CREATE POLICY saved_inbox_views_write ON saved_inbox_views FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS escalation_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  trigger_type VARCHAR(40) NOT NULL DEFAULT 'sla_breach'
    CHECK (trigger_type IN ('sla_breach', 'sla_warning', 'handoff', 'high_priority')),
  escalate_after_minutes INTEGER NOT NULL DEFAULT 15,
  notify_roles TEXT[] NOT NULL DEFAULT ARRAY['admin','manager']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_policies_org
  ON escalation_policies(organization_id) WHERE is_active;

ALTER TABLE escalation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escalation_policies_select ON escalation_policies;
CREATE POLICY escalation_policies_select ON escalation_policies FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS escalation_policies_write ON escalation_policies;
CREATE POLICY escalation_policies_write ON escalation_policies FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
