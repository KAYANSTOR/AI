-- Allow password accounts to identify themselves by a unique E.164 phone number.
-- No SMS or phone ownership verification is performed by this migration.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_key
  ON auth.users (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_phone_e164_check'
      AND conrelid = 'auth.users'::regclass
  ) THEN
    ALTER TABLE auth.users
      ADD CONSTRAINT users_phone_e164_check
      CHECK (phone IS NULL OR phone ~ '^[+][1-9][0-9]{7,14}$');
  END IF;
END $$;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 1
    CHECK (onboarding_step BETWEEN 1 AND 4);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS website_url text;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.business_profiles
   SET onboarding_step = 4
 WHERE business_id IS NOT NULL;

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
CREATE POLICY website_pages_select ON public.website_pages
  FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY website_pages_insert ON public.website_pages
  FOR INSERT WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY website_pages_update ON public.website_pages
  FOR UPDATE USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY website_pages_delete ON public.website_pages
  FOR DELETE USING (public.is_org_admin(organization_id));

CREATE TRIGGER website_pages_updated_at
  BEFORE UPDATE ON public.website_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  new_business_id UUID;
  org_name TEXT;
  business_slug TEXT;
  business_type TEXT;
BEGIN
  org_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'organization_name', ''),
    CASE
      WHEN NEW.email IS NOT NULL THEN split_part(NEW.email, '@', 1) || '''s Business'
      ELSE 'Business +' || right(NEW.phone, 4)
    END
  );
  INSERT INTO organizations (name) VALUES (org_name) RETURNING id INTO new_org_id;
  INSERT INTO organization_members (organization_id, user_id, role) VALUES (new_org_id, NEW.id, 'owner');
  INSERT INTO business_profiles (organization_id, industry, timezone) VALUES (new_org_id, 'beauty_wellness', 'UTC');
  business_type := NULLIF(NEW.raw_user_meta_data->>'business_type_id', '');
  IF business_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM business_types WHERE id = business_type) THEN
    business_type := NULL;
  END IF;
  business_slug := COALESCE(
    NULLIF(trim(both '-' from regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g')), ''),
    'business-' || substr(new_org_id::text, 1, 8)
  );
  INSERT INTO businesses (organization_id, name, slug, business_type_id, timezone)
    VALUES (new_org_id, org_name, business_slug, business_type, 'UTC')
    RETURNING id INTO new_business_id;
  UPDATE business_profiles
     SET business_id = new_business_id, business_type_id = business_type
   WHERE organization_id = new_org_id;
  INSERT INTO business_hours (organization_id, day_of_week, open_time, close_time, is_closed) VALUES
    (new_org_id, 0, '09:00', '18:00', true),
    (new_org_id, 1, '09:00', '18:00', false),
    (new_org_id, 2, '09:00', '18:00', false),
    (new_org_id, 3, '09:00', '18:00', false),
    (new_org_id, 4, '09:00', '18:00', false),
    (new_org_id, 5, '09:00', '18:00', false),
    (new_org_id, 6, '10:00', '16:00', false);
  RETURN NEW;
END;
$$;
