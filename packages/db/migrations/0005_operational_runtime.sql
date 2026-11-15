-- FrontDesk AI operational runtime foundation.
-- Canonical schema additions for Business/Location/Channel/Agent governance, confirmations,
-- reliable outbound delivery, observability, consent and billing entitlements.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.get_user_organizations()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT organization_id FROM organization_members WHERE user_id=auth.uid(); $$;
CREATE OR REPLACE FUNCTION private.is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM organization_members WHERE organization_id=org_id AND user_id=auth.uid()); $$;
CREATE OR REPLACE FUNCTION private.is_org_admin(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM organization_members WHERE organization_id=org_id AND user_id=auth.uid() AND role IN('owner','admin')); $$;
REVOKE ALL ON FUNCTION private.get_user_organizations() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_org_admin(UUID) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_admin(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT * FROM private.get_user_organizations(); $$;
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT private.is_org_member(org_id); $$;
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$ SELECT private.is_org_admin(org_id); $$;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  business_type_id TEXT REFERENCES business_types(id),
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_businesses_org ON businesses(organization_id);
CREATE INDEX IF NOT EXISTS idx_businesses_type ON businesses(business_type_id);

ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS business_id UUID;
INSERT INTO businesses (organization_id,name,slug,business_type_id,timezone)
SELECT bp.organization_id,o.name,
  COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(COALESCE(NULLIF(o.name,''),'business')),'[^a-z0-9]+','-','g')),''),
    'business-'||substr(o.id::text,1,8)),
  bp.business_type_id,COALESCE(bp.timezone,'UTC')
FROM business_profiles bp JOIN organizations o ON o.id=bp.organization_id
LEFT JOIN businesses b ON b.organization_id=bp.organization_id
WHERE b.id IS NULL;
UPDATE business_profiles bp SET business_id=b.id FROM businesses b
WHERE b.organization_id=bp.organization_id AND bp.business_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_profiles_business_id_fkey') THEN
    ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS business_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  timezone VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_locations_business ON business_locations(business_id);

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS location_id UUID,
  ADD COLUMN IF NOT EXISTS provider_account_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_identifier VARCHAR(255),
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE channels c SET business_id=b.id FROM businesses b
WHERE b.organization_id=c.organization_id AND c.business_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channels_business_id_fkey') THEN
    ALTER TABLE channels ADD CONSTRAINT channels_business_id_fkey
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='channels_location_id_fkey') THEN
    ALTER TABLE channels ADD CONSTRAINT channels_location_id_fkey
      FOREIGN KEY(location_id) REFERENCES business_locations(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_channels_business ON channels(business_id);
CREATE INDEX IF NOT EXISTS idx_channels_location ON channels(location_id);
CREATE INDEX IF NOT EXISTS idx_channels_binding ON channels(channel_type,provider_account_id,external_identifier) WHERE is_active=TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_channel_provider_account ON channels(channel_type,provider_account_id)
WHERE provider_account_id IS NOT NULL AND is_active=TRUE;

ALTER TABLE phone_connections
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS vapi_phone_number_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vapi_assistant_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
UPDATE phone_connections p SET business_id=b.id FROM businesses b
WHERE b.organization_id=p.organization_id AND p.business_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='phone_connections_business_id_fkey') THEN
    ALTER TABLE phone_connections ADD CONSTRAINT phone_connections_business_id_fkey
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(20) NOT NULL DEFAULT 'ar';
UPDATE ai_agents a SET business_id=b.id FROM businesses b
WHERE a.organization_id=b.organization_id AND a.business_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_agents_business_id_fkey') THEN
    ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_business_id_fkey
      FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_agents_business ON ai_agents(business_id);
INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
SELECT b.organization_id,b.id,b.name||' AI','frontdesk','anthropic',0.2,'active','ar'
FROM businesses b
WHERE NOT EXISTS(SELECT 1 FROM ai_agents a WHERE a.business_id=b.id AND a.status<>'archived');

CREATE TABLE IF NOT EXISTS agent_prompt_versions(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,system_prompt_addition TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),
 created_by UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),published_at TIMESTAMPTZ,
 UNIQUE(agent_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_prompt_published ON agent_prompt_versions(agent_id) WHERE status='published';

CREATE TABLE IF NOT EXISTS agent_tool_policies(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
 tool_name VARCHAR(120) NOT NULL,is_allowed BOOLEAN NOT NULL DEFAULT TRUE,requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(agent_id,tool_name)
);

CREATE TABLE IF NOT EXISTS pending_actions(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,tool_name VARCHAR(120) NOT NULL,arguments JSONB NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','cancelled','expired','executed','failed')),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT(NOW()+INTERVAL '15 minutes'),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 confirmed_at TIMESTAMPTZ,executed_at TIMESTAMPTZ,result JSONB,error_message TEXT
);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS business_id UUID,
  ADD COLUMN IF NOT EXISTS state VARCHAR(40) NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS human_assignee_id UUID REFERENCES organization_members(id),
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ;
UPDATE conversations c SET business_id=b.id FROM businesses b
WHERE b.organization_id=c.organization_id AND c.business_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversations_business_id_fkey') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_business_id_fkey FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='conversations_state_check') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_state_check
      CHECK(state IN('new','discovery','qualifying','waiting_customer','waiting_external','action_pending','completed','human_handoff','follow_up','closed'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversations_business_state ON conversations(business_id,state,updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_conversation_active ON conversations(organization_id,contact_id,channel_id) WHERE status='active';

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS outbox_events(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
 event_type VARCHAR(100) NOT NULL,idempotency_key VARCHAR(255) NOT NULL,recipient VARCHAR(255) NOT NULL,payload JSONB NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed','dead_letter','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,
 last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS agent_runs(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
 conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,channel VARCHAR(30) NOT NULL,model_provider VARCHAR(50) NOT NULL,
 model VARCHAR(120),prompt_version_id UUID REFERENCES agent_prompt_versions(id) ON DELETE SET NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK(status IN('running','completed','failed','blocked')),
 input_tokens INTEGER,output_tokens INTEGER,latency_ms INTEGER,trace_id VARCHAR(120),error_code VARCHAR(120),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tool_executions(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
 tool_name VARCHAR(120) NOT NULL,status VARCHAR(30) NOT NULL CHECK(status IN('started','succeeded','failed','blocked','confirmation_required')),
 arguments JSONB NOT NULL DEFAULT '{}'::jsonb,result JSONB,error_message TEXT,requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
 latency_ms INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,actor_type VARCHAR(20) NOT NULL CHECK(actor_type IN('user','agent','system','provider')),
 actor_id UUID,action VARCHAR(120) NOT NULL,entity_type VARCHAR(120),entity_id UUID,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,channel VARCHAR(30) NOT NULL,purpose VARCHAR(60) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN('opted_in','opted_out','unknown')),source VARCHAR(60) NOT NULL,policy_version VARCHAR(60),
 captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_ledger(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,event_type VARCHAR(60) NOT NULL,units NUMERIC(18,4) NOT NULL,
 unit_cost NUMERIC(18,6),currency VARCHAR(3) NOT NULL DEFAULT 'USD',reference_type VARCHAR(60),reference_id UUID,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_entitlements(
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 feature_key VARCHAR(120) NOT NULL,limit_value NUMERIC(18,4),
 period VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK(period IN('daily','monthly','unlimited')),
 enabled BOOLEAN NOT NULL DEFAULT TRUE,source VARCHAR(30) NOT NULL DEFAULT 'plan',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(organization_id,feature_key)
);

CREATE INDEX IF NOT EXISTS idx_business_locations_business ON business_locations(business_id);
CREATE INDEX IF NOT EXISTS idx_channels_location ON channels(location_id);
CREATE INDEX IF NOT EXISTS idx_phone_connections_business ON phone_connections(business_id);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_agent ON agent_prompt_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_policies_agent ON agent_tool_policies(agent_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_business ON pending_actions(business_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_contact ON pending_actions(contact_id);
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
CREATE INDEX IF NOT EXISTS idx_messages_org_conversation ON messages(organization_id,conversation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_services_org ON services(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_contact ON leads(organization_id,contact_id);

INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) SELECT id,'get_customer',TRUE,FALSE FROM ai_agents ON CONFLICT DO NOTHING;
INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) SELECT id,'find_available_slots',TRUE,FALSE FROM ai_agents ON CONFLICT DO NOTHING;
INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) SELECT id,'create_appointment',TRUE,TRUE FROM ai_agents ON CONFLICT DO NOTHING;
INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) SELECT id,'request_human_handoff',TRUE,FALSE FROM ai_agents ON CONFLICT DO NOTHING;
INSERT INTO agent_prompt_versions(agent_id,version,system_prompt_addition,status,published_at)
SELECT a.id,1,bp.system_prompt_addition,'published',NOW() FROM ai_agents a JOIN business_profiles bp ON bp.business_id=a.business_id
WHERE NOT EXISTS(SELECT 1 FROM agent_prompt_versions p WHERE p.agent_id=a.id);
INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled)
SELECT id,'ai_messages_monthly',10000,'monthly',TRUE FROM organizations ON CONFLICT DO NOTHING;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_select ON businesses FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY businesses_insert ON businesses FOR INSERT TO authenticated WITH CHECK(public.is_org_admin(organization_id));
CREATE POLICY businesses_update ON businesses FOR UPDATE TO authenticated USING(public.is_org_admin(organization_id)) WITH CHECK(public.is_org_admin(organization_id));
CREATE POLICY businesses_delete ON businesses FOR DELETE TO authenticated USING(public.is_org_admin(organization_id));

CREATE POLICY locations_select ON business_locations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM businesses b WHERE b.id=business_locations.business_id AND public.is_org_member(b.organization_id)));
CREATE POLICY locations_insert ON business_locations FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM businesses b WHERE b.id=business_locations.business_id AND public.is_org_admin(b.organization_id)));
CREATE POLICY locations_update ON business_locations FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM businesses b WHERE b.id=business_locations.business_id AND public.is_org_admin(b.organization_id))) WITH CHECK(EXISTS(SELECT 1 FROM businesses b WHERE b.id=business_locations.business_id AND public.is_org_admin(b.organization_id)));
CREATE POLICY locations_delete ON business_locations FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM businesses b WHERE b.id=business_locations.business_id AND public.is_org_admin(b.organization_id)));

CREATE POLICY prompt_versions_select ON agent_prompt_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ai_agents a WHERE a.id=agent_prompt_versions.agent_id AND public.is_org_member(a.organization_id)));
CREATE POLICY tool_policies_select ON agent_tool_policies FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM ai_agents a WHERE a.id=agent_tool_policies.agent_id AND public.is_org_member(a.organization_id)));
CREATE POLICY pending_actions_select ON pending_actions FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY outbox_select ON outbox_events FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY agent_runs_select ON agent_runs FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY tool_executions_select ON tool_executions FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY audit_events_select ON audit_events FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY consents_select ON consents FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY usage_ledger_select ON usage_ledger FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
CREATE POLICY entitlements_select ON billing_entitlements FOR SELECT TO authenticated USING(public.is_org_member(organization_id));

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_events_select ON webhook_events FOR SELECT TO authenticated
USING(organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE new_org_id UUID; new_business_id UUID; org_name TEXT; business_type TEXT; business_slug TEXT;
BEGIN
  org_name:=COALESCE(NEW.raw_user_meta_data->>'organization_name',split_part(NEW.email,'@',1)||'''s Business');
  business_type:=COALESCE(NEW.raw_user_meta_data->>'business_type_id','appointments');
  business_slug:=COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(COALESCE(NULLIF(org_name,''),'business')),'[^a-z0-9]+','-','g')),''),'business-'||substr(NEW.id::text,1,8));
  INSERT INTO organizations(name) VALUES(org_name) RETURNING id INTO new_org_id;
  INSERT INTO organization_members(organization_id,user_id,role) VALUES(new_org_id,NEW.id,'owner');
  INSERT INTO businesses(organization_id,name,slug,business_type_id,timezone) VALUES(new_org_id,org_name,business_slug,business_type,'UTC') RETURNING id INTO new_business_id;
  INSERT INTO business_profiles(organization_id,business_id,industry,timezone,business_type_id) VALUES(new_org_id,new_business_id,business_type,'UTC',business_type);
  INSERT INTO business_hours(organization_id,day_of_week,open_time,close_time,is_closed) VALUES
    (new_org_id,0,'09:00','18:00',TRUE),(new_org_id,1,'09:00','18:00',FALSE),(new_org_id,2,'09:00','18:00',FALSE),
    (new_org_id,3,'09:00','18:00',FALSE),(new_org_id,4,'09:00','18:00',FALSE),(new_org_id,5,'09:00','18:00',FALSE),(new_org_id,6,'10:00','16:00',FALSE);
  INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
    VALUES(new_org_id,new_business_id,org_name||' AI','frontdesk','anthropic',0.2,'active','ar');
  INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled) VALUES
    (new_org_id,'ai_messages_monthly',10000,'monthly',TRUE),(new_org_id,'phone_minutes_monthly',300,'monthly',TRUE),(new_org_id,'sms_monthly',500,'monthly',TRUE)
    ON CONFLICT(organization_id,feature_key) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
