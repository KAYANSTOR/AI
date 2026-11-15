-- Agent governance provisioning for new signups (additive; safe on an already-migrated database).
--
-- Root cause addressed here:
--   0005 seeded agent_tool_policies and agent_prompt_versions only for agents that
--   already existed when it ran. Every agent created afterwards — including the one
--   that handle_new_user() creates for each new signup — had zero tool policies and
--   zero published prompt versions.
--
--   Consequence: a brand-new tenant's agent had no explicit, auditable governance
--   rows in the database. The runtime still applied the registry defaults, so no
--   unauthorized tool became reachable, but the Agent Management surface had nothing
--   to read or edit and the DB contract's agent_tool_policies table was effectively
--   empty for the tenant the runtime actually uses.
--
-- This migration backfills existing agents and extends the signup trigger, without
-- rewriting any previously applied migration.

-- 1. Backfill missing tool policies, mirroring lib/ai/registry.ts defaults ---------
INSERT INTO agent_tool_policies(agent_id, tool_name, is_allowed, requires_confirmation)
SELECT a.id, seed.tool_name, TRUE, seed.requires_confirmation
FROM ai_agents a
CROSS JOIN (VALUES
  ('get_customer', FALSE),
  ('find_available_slots', FALSE),
  ('create_appointment', TRUE),
  ('request_human_handoff', FALSE)
) AS seed(tool_name, requires_confirmation)
ON CONFLICT (agent_id, tool_name) DO NOTHING;

-- 2. Backfill a published prompt version for agents that never got one -------------
INSERT INTO agent_prompt_versions(agent_id, version, system_prompt_addition, status, published_at)
SELECT a.id, 1, bp.system_prompt_addition, 'published', NOW()
FROM ai_agents a
LEFT JOIN business_profiles bp ON bp.business_id = a.business_id
WHERE NOT EXISTS (SELECT 1 FROM agent_prompt_versions p WHERE p.agent_id = a.id);

-- 3. Signup must produce the same complete agent profile -------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE new_org_id UUID; new_business_id UUID; new_agent_id UUID; org_name TEXT; business_type TEXT; business_slug TEXT;
BEGIN
  org_name:=COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'organization_name'),''),split_part(NEW.email,'@',1)||'''s Business');

  business_type:=COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'business_type_id'),''),'appointments');
  IF NOT EXISTS(SELECT 1 FROM business_types WHERE id=business_type) THEN
    business_type:='appointments';
  END IF;

  business_slug:=COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(org_name),'[^a-z0-9]+','-','g')),''),'business-'||substr(NEW.id::text,1,8));

  INSERT INTO organizations(name) VALUES(org_name) RETURNING id INTO new_org_id;
  INSERT INTO organization_members(organization_id,user_id,role) VALUES(new_org_id,NEW.id,'owner');
  INSERT INTO businesses(organization_id,name,slug,business_type_id,timezone) VALUES(new_org_id,org_name,business_slug,business_type,'UTC') RETURNING id INTO new_business_id;
  INSERT INTO business_profiles(organization_id,business_id,industry,timezone,business_type_id) VALUES(new_org_id,new_business_id,business_type,'UTC',business_type);
  INSERT INTO business_hours(organization_id,day_of_week,open_time,close_time,is_closed) VALUES
    (new_org_id,0,'09:00','18:00',TRUE),(new_org_id,1,'09:00','18:00',FALSE),(new_org_id,2,'09:00','18:00',FALSE),
    (new_org_id,3,'09:00','18:00',FALSE),(new_org_id,4,'09:00','18:00',FALSE),(new_org_id,5,'09:00','18:00',FALSE),(new_org_id,6,'10:00','16:00',FALSE);
  INSERT INTO ai_agents(organization_id,business_id,name,slug,model_provider,temperature,status,locale)
    VALUES(new_org_id,new_business_id,org_name||' AI','frontdesk','anthropic',0.2,'active','ar')
    RETURNING id INTO new_agent_id;

  -- The agent is only governable once its tool policy and published prompt exist.
  INSERT INTO agent_tool_policies(agent_id,tool_name,is_allowed,requires_confirmation) VALUES
    (new_agent_id,'get_customer',TRUE,FALSE),
    (new_agent_id,'find_available_slots',TRUE,FALSE),
    (new_agent_id,'create_appointment',TRUE,TRUE),
    (new_agent_id,'request_human_handoff',TRUE,FALSE);
  INSERT INTO agent_prompt_versions(agent_id,version,system_prompt_addition,status,published_at)
    VALUES(new_agent_id,1,NULL,'published',NOW());

  INSERT INTO organization_capabilities(organization_id,capability_id,is_enabled)
    SELECT new_org_id,btc.capability_id,TRUE
    FROM business_type_capabilities btc
    WHERE btc.business_type_id=business_type AND btc.is_default=TRUE
    ON CONFLICT(organization_id,capability_id) DO NOTHING;
  INSERT INTO billing_entitlements(organization_id,feature_key,limit_value,period,enabled) VALUES
    (new_org_id,'ai_messages_monthly',10000,'monthly',TRUE),(new_org_id,'phone_minutes_monthly',300,'monthly',TRUE),(new_org_id,'sms_monthly',500,'monthly',TRUE)
    ON CONFLICT(organization_id,feature_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
