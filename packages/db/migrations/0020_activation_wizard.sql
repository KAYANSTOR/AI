-- Phase 1.1 Activation Wizard Migration

ALTER TABLE business_profiles
  ADD COLUMN activation_state VARCHAR(50) DEFAULT 'workspace_ready' CHECK (activation_state IN ('account_created', 'email_pending', 'workspace_ready', 'configuring', 'ready_for_test', 'ready_to_activate', 'active')),
  ADD COLUMN activation_step INTEGER DEFAULT 1 CHECK (activation_step BETWEEN 1 AND 11),
  ADD COLUMN smoke_test_status VARCHAR(50) DEFAULT 'none' CHECK (smoke_test_status IN ('none', 'pending', 'passed', 'failed')),
  ADD COLUMN smoke_test_result JSONB;

-- By default, existing ones that were already setup might be considered active, but let's just let the app logic handle it or set it based on capabilities.
UPDATE business_profiles 
SET activation_state = 'active', activation_step = 11, smoke_test_status = 'passed'
WHERE business_type_id IS NOT NULL 
AND EXISTS (
    SELECT 1 FROM organization_capabilities oc 
    WHERE oc.organization_id = business_profiles.organization_id AND oc.is_enabled = true
);
