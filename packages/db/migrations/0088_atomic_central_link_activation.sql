-- Serialize verified link transfers and consume the exact still-valid token in one transaction.
-- Only the trusted webhook service may call this function. Never expose token or phone in logs.
CREATE OR REPLACE FUNCTION public.consume_central_link_activation(
  p_link_id uuid, p_org_id uuid, p_user_id uuid, p_token text, p_phone text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  checked_at timestamptz;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Z0-9]{4,12}$'
     OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN false;
  END IF;

  -- A short transaction-wide lock serializes transfers, including swaps between two accounts.
  -- Other link mutations contend on the relevant row locks; no network calls inside this function.
  PERFORM pg_advisory_xact_lock(844127, 1);

  SELECT l.id INTO target_id
  FROM public.personal_assistant_links l
  WHERE l.id = p_link_id AND l.org_id = p_org_id AND l.user_id = p_user_id
    AND l.verification_token = p_token
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Lock the old link before checking the token deadline; a lock wait must not extend validity.
  PERFORM 1 FROM public.personal_assistant_links l
    WHERE l.whatsapp_phone = p_phone AND l.id <> target_id FOR UPDATE;

  checked_at := clock_timestamp();
  IF NOT EXISTS (
    SELECT 1 FROM public.personal_assistant_links l
    WHERE l.id = target_id AND l.verification_token = p_token AND l.token_expires_at > checked_at
  ) THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = p_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_org_id AND (
      o.business_type = 'personal_assistant' OR o.personal_assistant_addon_enabled IS TRUE
      OR EXISTS (
        SELECT 1 FROM public.business_profiles bp
        WHERE bp.organization_id = o.id AND bp.business_type_id = 'personal_assistant'
      )
    )
  ) THEN RETURN false; END IF;

  UPDATE public.personal_assistant_links
    SET whatsapp_phone = NULL, verified_at = NULL
    WHERE whatsapp_phone = p_phone AND id <> target_id;

  UPDATE public.personal_assistant_links
    SET whatsapp_phone = p_phone, verified_at = checked_at,
        verification_token = NULL, token_expires_at = NULL
    WHERE id = target_id AND org_id = p_org_id AND user_id = p_user_id
      AND verification_token = p_token;
  IF NOT FOUND THEN
    -- Roll back the old-link update too, never silently detach a previous owner.
    RAISE EXCEPTION 'central_link_activation_conflict';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_central_link_activation(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_central_link_activation(uuid, uuid, uuid, text, text)
  TO service_role;
