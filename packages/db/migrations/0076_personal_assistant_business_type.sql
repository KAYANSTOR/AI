-- Make the personal assistant available as the first signup sector.
-- The application keeps its dedicated personal-assistant runtime separate from
-- customer-facing business agents while retaining the standard lead capability
-- set required by the existing onboarding and activation flow.
INSERT INTO public.business_types (id, name, description)
VALUES ('personal_assistant', 'المساعد الشخصي', 'مساعد خاص لإدارة المهام والمعلومات الشخصية لصاحب الحساب.')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO public.business_type_capabilities (business_type_id, capability_id, is_default)
SELECT 'personal_assistant', capability_id, TRUE
FROM unnest(ARRAY['lead_capture', 'quotes', 'knowledge_base', 'inbox', 'follow_up']) AS capability_id
ON CONFLICT (business_type_id, capability_id) DO UPDATE
SET is_default = EXCLUDED.is_default;
