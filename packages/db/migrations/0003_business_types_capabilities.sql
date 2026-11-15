-- Adaptive Business Operating Profile (PLAN.md Multi-Industry Core)
-- Nucleus stays one product; industries = configuration + capability modules

CREATE TABLE IF NOT EXISTS business_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_type_capabilities (
  business_type_id TEXT NOT NULL REFERENCES business_types(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (business_type_id, capability_id)
);

CREATE TABLE IF NOT EXISTS organization_capabilities (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_org_capabilities_org
  ON organization_capabilities(organization_id);

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS business_type_id TEXT REFERENCES business_types(id);

INSERT INTO business_types (id, name, description) VALUES
  ('weddings_events', 'Weddings & Events', 'Wedding planners and event organizers'),
  ('sales', 'Sales', 'Product/service sales, quotes, and orders'),
  ('appointments', 'Appointments & Booking', 'Clinics, salons, appointment-based services'),
  ('home_services', 'Home Services', 'Cleaning, HVAC, plumbing, on-site visits'),
  ('custom', 'Custom', 'Configurable general modules')
ON CONFLICT (id) DO NOTHING;

INSERT INTO capabilities (id, name, description) VALUES
  ('lead_capture', 'Lead Capture', 'Capture and qualify inbound leads'),
  ('appointments', 'Appointments', 'Book / reschedule / cancel appointments'),
  ('quotes', 'Quotes', 'Packages, pricing, and proposals'),
  ('orders', 'Orders', 'Order / request tracking'),
  ('follow_up', 'Follow-up', 'Automated follow-up sequences'),
  ('inbox', 'Unified Inbox', 'Multi-channel conversations'),
  ('knowledge_base', 'Knowledge Base', 'Business FAQs for AI')
ON CONFLICT (id) DO NOTHING;

INSERT INTO business_type_capabilities (business_type_id, capability_id, is_default) VALUES
  ('weddings_events', 'lead_capture', true),
  ('weddings_events', 'quotes', true),
  ('weddings_events', 'appointments', true),
  ('weddings_events', 'follow_up', true),
  ('weddings_events', 'inbox', true),
  ('sales', 'lead_capture', true),
  ('sales', 'quotes', true),
  ('sales', 'orders', true),
  ('sales', 'follow_up', true),
  ('sales', 'inbox', true),
  ('appointments', 'lead_capture', true),
  ('appointments', 'appointments', true),
  ('appointments', 'follow_up', true),
  ('appointments', 'inbox', true),
  ('appointments', 'knowledge_base', true),
  ('home_services', 'lead_capture', true),
  ('home_services', 'appointments', true),
  ('home_services', 'quotes', true),
  ('home_services', 'follow_up', true),
  ('home_services', 'inbox', true),
  ('custom', 'lead_capture', true),
  ('custom', 'inbox', true),
  ('custom', 'follow_up', true)
ON CONFLICT DO NOTHING;

UPDATE business_profiles
SET business_type_id = 'appointments'
WHERE business_type_id IS NULL;

INSERT INTO organization_capabilities (organization_id, capability_id, is_enabled)
SELECT bp.organization_id, btc.capability_id, true
FROM business_profiles bp
JOIN business_type_capabilities btc ON btc.business_type_id = COALESCE(bp.business_type_id, 'appointments')
WHERE btc.is_default = true
ON CONFLICT DO NOTHING;

ALTER TABLE business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_type_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bt_select ON business_types;
CREATE POLICY bt_select ON business_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cap_select ON capabilities;
CREATE POLICY cap_select ON capabilities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS btc_select ON business_type_capabilities;
CREATE POLICY btc_select ON business_type_capabilities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS oc_select ON organization_capabilities;
CREATE POLICY oc_select ON organization_capabilities FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS oc_write ON organization_capabilities;
CREATE POLICY oc_write ON organization_capabilities FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
