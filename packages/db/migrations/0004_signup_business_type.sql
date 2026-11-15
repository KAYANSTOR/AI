-- Signup: honor business_type_id from user metadata + seed organization_capabilities

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  btype TEXT;
BEGIN
  org_name := NEW.raw_user_meta_data->>'organization_name';
  IF org_name IS NULL OR length(btrim(org_name)) = 0 THEN
    org_name := split_part(NEW.email, '@', 1) || ' Business';
  END IF;

  btype := NEW.raw_user_meta_data->>'business_type_id';
  IF btype IS NULL OR length(btrim(btype)) = 0 THEN
    btype := 'appointments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM business_types WHERE id = btype) THEN
    btype := 'appointments';
  END IF;

  INSERT INTO organizations (name)
  VALUES (org_name)
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  INSERT INTO business_profiles (organization_id, industry, timezone, business_type_id)
  VALUES (new_org_id, 'beauty_wellness', 'UTC', btype);

  INSERT INTO business_hours (organization_id, day_of_week, open_time, close_time, is_closed) VALUES
    (new_org_id, 0, '09:00', '18:00', true),
    (new_org_id, 1, '09:00', '18:00', false),
    (new_org_id, 2, '09:00', '18:00', false),
    (new_org_id, 3, '09:00', '18:00', false),
    (new_org_id, 4, '09:00', '18:00', false),
    (new_org_id, 5, '09:00', '18:00', false),
    (new_org_id, 6, '10:00', '16:00', false);

  INSERT INTO organization_capabilities (organization_id, capability_id, is_enabled)
  SELECT new_org_id, btc.capability_id, true
  FROM business_type_capabilities btc
  WHERE btc.business_type_id = btype AND btc.is_default = true
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
