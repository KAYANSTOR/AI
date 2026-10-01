CREATE OR REPLACE FUNCTION public.guard_business_profile_activation_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (
      NEW.activation_state = 'configuring'
      AND NEW.activation_step = 1
      AND NEW.smoke_test_status IS NULL
      AND NEW.smoke_test_result IS NULL
    ) OR (
      NEW.activation_state = 'workspace_ready'
      AND NEW.activation_step = 1
      AND NEW.smoke_test_status = 'none'
      AND NEW.smoke_test_result IS NULL
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'activation fields may only be initialized during signup'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.activation_step IS DISTINCT FROM OLD.activation_step
    OR NEW.activation_state IS DISTINCT FROM OLD.activation_state
    OR NEW.smoke_test_status IS DISTINCT FROM OLD.smoke_test_status
    OR NEW.smoke_test_result IS DISTINCT FROM OLD.smoke_test_result THEN
    RAISE EXCEPTION 'activation fields may only be changed by the server activation flow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_business_profile_activation_fields ON public.business_profiles;
CREATE TRIGGER guard_business_profile_activation_fields
  BEFORE INSERT OR UPDATE ON public.business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_business_profile_activation_fields();