-- 0026_reminders_and_workflows.sql
-- Appointment reminder tracking + Phase 3 workflow definitions/runs (bounded).

-- ==========================================
-- 1. APPOINTMENT REMINDERS
-- ==========================================
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES business_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_window
  ON appointments(organization_id, starts_at)
  WHERE status IN ('pending', 'confirmed')
    AND (reminder_24h_sent_at IS NULL OR reminder_1h_sent_at IS NULL);

-- ==========================================
-- 2. WORKFLOWS (Phase 3 foundation)
-- ==========================================
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'tested', 'published', 'retired')),
  trigger_type VARCHAR(80) NOT NULL,
  definition JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org_status
  ON workflows(organization_id, status);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflows_select ON workflows;
CREATE POLICY workflows_select ON workflows FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS workflows_write ON workflows;
CREATE POLICY workflows_write ON workflows FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'stopped')),
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_node_id VARCHAR(80),
  iteration_count INTEGER NOT NULL DEFAULT 0,
  max_iterations INTEGER NOT NULL DEFAULT 50,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wait_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  idempotency_key VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_due
  ON workflow_runs(organization_id, status, wait_until)
  WHERE status IN ('running', 'waiting');

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_runs_select ON workflow_runs;
CREATE POLICY workflow_runs_select ON workflow_runs FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id VARCHAR(80) NOT NULL,
  node_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'skipped')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  iteration INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run
  ON workflow_run_steps(run_id, created_at);

ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_run_steps_select ON workflow_run_steps;
CREATE POLICY workflow_run_steps_select ON workflow_run_steps FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
