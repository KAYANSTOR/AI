-- 0023_team_notifications_followup.sql
-- Align organization_members roles with the application TEAM_ROLES model,
-- add internal notifications with tenant isolation, and harden follow-up enrollments.

-- ==========================================
-- 1. TEAM ROLES + ACTIVE FLAG
-- ==========================================
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Drop legacy check if present, then enforce the canonical role set.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_role_check'
  ) THEN
    ALTER TABLE organization_members DROP CONSTRAINT organization_members_role_check;
  END IF;
END $$;

-- Map legacy labels before enforcing the new check.
UPDATE organization_members SET role = 'member' WHERE role = 'agent';
UPDATE organization_members SET role = 'read_only' WHERE role = 'viewer';

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'member', 'read_only'));

CREATE INDEX IF NOT EXISTS idx_organization_members_org_active
  ON organization_members(organization_id) WHERE is_active;

-- ==========================================
-- 2. INTERNAL NOTIFICATIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES organization_members(id) ON DELETE CASCADE,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  notification_type VARCHAR(40) NOT NULL
    CHECK (notification_type IN ('assignment', 'handoff', 'high_priority', 'provider_error')),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_idempotency
  ON notifications(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_member_unread
  ON notifications(organization_id, member_id, created_at DESC)
  WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ==========================================
-- 3. FOLLOW-UP DURABILITY
-- ==========================================
ALTER TABLE followup_enrollments
  ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(120),
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- Prevent duplicate active enrollments for the same contact + sequence.
CREATE UNIQUE INDEX IF NOT EXISTS ux_followup_active_enrollment
  ON followup_enrollments(organization_id, contact_id, sequence_id)
  WHERE status IN ('scheduled', 'eligible', 'sending');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'followup_enrollments_status_check'
  ) THEN
    ALTER TABLE followup_enrollments DROP CONSTRAINT followup_enrollments_status_check;
  END IF;
END $$;

ALTER TABLE followup_enrollments
  ADD CONSTRAINT followup_enrollments_status_check
  CHECK (status IN ('scheduled', 'eligible', 'sending', 'sent', 'replied', 'cancelled', 'completed', 'failed', 'exited'));
