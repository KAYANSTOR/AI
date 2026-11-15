-- Runtime integrity fixes (additive; safe on an already-migrated database).
--
-- Root causes addressed here:
--  1. contact_identities had no uniqueness for the identity key the runtime upserts on,
--     so exact identity linking failed with "no unique or exclusion constraint matching
--     the ON CONFLICT specification".
--  2. messages relied only on webhook_events for dedupe; the provider message id is now
--     enforced per conversation (the runtime tolerates 23505).
--  3. handle_new_user (redefined in 0005) stopped seeding organization_capabilities, so a
--     new signup started with zero enabled capabilities and no governed AI tools.

-- 1. Exact identity keys -------------------------------------------------------
DELETE FROM contact_identities a
USING contact_identities b
WHERE a.ctid > b.ctid
  AND a.contact_id = b.contact_id
  AND a.channel = b.channel
  AND a.external_user_id = b.external_user_id
  AND a.external_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_contact_identities_external
  ON contact_identities(contact_id, channel, external_user_id)
  WHERE external_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_identities_lookup
  ON contact_identities(channel, external_user_id);

-- 2. One stored copy of a provider message per conversation ---------------------
DELETE FROM messages a
USING messages b
WHERE a.ctid > b.ctid
  AND a.conversation_id = b.conversation_id
  AND a.external_message_id = b.external_message_id
  AND a.external_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_external
  ON messages(conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- 3. Signup must build the full adaptive profile ------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE new_org_id UUID; new_business_id UUID; org_name TEXT; business_type TEXT; business_slug TEXT;
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
    VALUES(new_org_id,new_business_id,org_name||' AI','frontdesk','anthropic',0.2,'active','ar');
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

-- Agents created before this migration must also carry the default tool policies
-- already seeded by 0005, so only missing capability rows are backfilled here.
INSERT INTO organization_capabilities(organization_id,capability_id,is_enabled)
SELECT bp.organization_id,btc.capability_id,TRUE
FROM business_profiles bp
JOIN business_type_capabilities btc ON btc.business_type_id=bp.business_type_id AND btc.is_default=TRUE
WHERE NOT EXISTS(
  SELECT 1 FROM organization_capabilities oc
  WHERE oc.organization_id=bp.organization_id AND oc.capability_id=btc.capability_id
);
