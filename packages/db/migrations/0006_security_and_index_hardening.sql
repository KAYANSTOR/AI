-- Root-cause security and performance hardening.
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT * FROM private.get_user_organizations(); $$;
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT private.is_org_member(org_id); $$;
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT private.is_org_admin(org_id); $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

DROP POLICY IF EXISTS members_insert ON organization_members;
CREATE POLICY members_insert ON organization_members FOR INSERT TO authenticated
WITH CHECK((select public.is_org_admin(organization_id)) OR user_id=(select auth.uid()));

DROP POLICY IF EXISTS businesses_write ON businesses;
DROP POLICY IF EXISTS locations_write ON business_locations;
DROP POLICY IF EXISTS oc_write ON organization_capabilities;

CREATE INDEX IF NOT EXISTS idx_business_profiles_business ON business_profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_business_type_caps_capability ON business_type_capabilities(capability_id);
CREATE INDEX IF NOT EXISTS idx_business_locations_business ON business_locations(business_id);
CREATE INDEX IF NOT EXISTS idx_channels_location ON channels(location_id);
CREATE INDEX IF NOT EXISTS idx_phone_connections_carrier ON phone_connections(carrier_profile_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_business ON ai_agents(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_agent ON agent_prompt_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_policies_agent ON agent_tool_policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_business ON pending_actions(business_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_org ON pending_actions(organization_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_contact ON pending_actions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_human_assignee ON conversations(human_assignee_id);
CREATE INDEX IF NOT EXISTS idx_outbox_business ON outbox_events(business_id);
CREATE INDEX IF NOT EXISTS idx_outbox_channel ON outbox_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_business ON agent_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_prompt_version ON agent_runs(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_org ON tool_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_conversation ON tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_business ON audit_events(business_id);
CREATE INDEX IF NOT EXISTS idx_consents_contact ON consents(contact_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_business ON usage_ledger(business_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contact_identities_contact ON contact_identities(contact_id);
