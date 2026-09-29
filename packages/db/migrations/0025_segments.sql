-- 0025_segments.sql
-- Saved audience segments for follow-up / campaigns (Phase 2.6 / Phase 3 prep).

CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_segments_org ON segments(organization_id) WHERE is_active;

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS segments_select ON segments;
CREATE POLICY segments_select ON segments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS segments_write ON segments;
CREATE POLICY segments_write ON segments FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Optional membership cache for large audiences (materialized later by jobs).
CREATE TABLE IF NOT EXISTS segment_members (
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (segment_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_members_org_contact
  ON segment_members(organization_id, contact_id);

ALTER TABLE segment_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS segment_members_select ON segment_members;
CREATE POLICY segment_members_select ON segment_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS segment_members_write ON segment_members;
CREATE POLICY segment_members_write ON segment_members FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
