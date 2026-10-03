-- 0037_it_technology_business_type.sql
-- Adds IT & Technology company business type and default capabilities

INSERT INTO business_types (id, name, description) VALUES
  ('it_technology', 'IT & Technology', 'Information technology, software development, cloud services, and IT consulting')
ON CONFLICT (id) DO NOTHING;

INSERT INTO business_type_capabilities (business_type_id, capability_id, is_default) VALUES
  ('it_technology', 'lead_capture', true),
  ('it_technology', 'quotes', true),
  ('it_technology', 'appointments', true),
  ('it_technology', 'follow_up', true),
  ('it_technology', 'inbox', true),
  ('it_technology', 'knowledge_base', true)
ON CONFLICT DO NOTHING;
