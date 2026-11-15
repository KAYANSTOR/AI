-- Migration 0043: phone login, onboarding progress, and website pages.
-- Additive; no records are deleted. Phone ownership verification (SMS/OTP) is out of scope.

-- Phone-based password accounts use normalized E.164 numbers.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'auth.users'::regclass AND conname = 'users_phone_e164_check'
  ) THEN
    ALTER TABLE auth.users
      ADD CONSTRAINT users_phone_e164_check
      CHECK (phone IS NULL OR phone ~ '^[+][1-9][0-9]{7,14}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key
  ON auth.users (phone)
  WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL;

-- Preserve an explicit step in the four-stage business onboarding flow.
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_profiles'::regclass
      AND conname = 'business_profiles_onboarding_step_check'
  ) THEN
    ALTER TABLE public.business_profiles
      ADD CONSTRAINT business_profiles_onboarding_step_check
      CHECK (onboarding_step BETWEEN 1 AND 4);
  END IF;
END $$;

UPDATE public.business_profiles bp
   SET onboarding_step = 4
  FROM public.businesses b
 WHERE b.id = bp.business_id
   AND bp.onboarding_step <> 4;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS website_url text;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text;

-- The schema matches apps/web/src/app/dashboard/website-pages/actions.ts.
CREATE TABLE IF NOT EXISTS public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  path text NOT NULL CHECK (path ~ '^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/?)*$'),
  title text,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft', 'scheduled')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, path)
);

CREATE INDEX IF NOT EXISTS website_pages_org_updated_idx
  ON public.website_pages (organization_id, updated_at DESC);

ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_pages_select ON public.website_pages;
CREATE POLICY website_pages_select ON public.website_pages
  FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS website_pages_insert ON public.website_pages;
CREATE POLICY website_pages_insert ON public.website_pages
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS website_pages_update ON public.website_pages;
CREATE POLICY website_pages_update ON public.website_pages
  FOR UPDATE USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS website_pages_delete ON public.website_pages;
CREATE POLICY website_pages_delete ON public.website_pages
  FOR DELETE USING (public.is_org_admin(organization_id));

DROP TRIGGER IF EXISTS trigger_update_website_pages_updated_at ON public.website_pages;
CREATE TRIGGER trigger_update_website_pages_updated_at
  BEFORE UPDATE ON public.website_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Retain the existing governance provisioning for every newly registered account,
-- while allowing phone-only accounts to receive a useful organization name.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE new_org_id UUID; new_business_id UUID; new_agent_id UUID; org_name TEXT; business_type TEXT; business_slug TEXT;
BEGIN
  org_name:=COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'organization_name'),''),
    CASE WHEN NULLIF(btrim(NEW.email),'') IS NOT NULL THEN split_part(NEW.email,'@',1)||'''s Business' END,
    CASE WHEN NULLIF(btrim(NEW.phone),'') IS NOT NULL THEN 'Business '||right(NEW.phone,4) END,
    'Business '||substr(NEW.id::text,1,8));

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
