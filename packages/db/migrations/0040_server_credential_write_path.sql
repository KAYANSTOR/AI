-- Allow trusted server writes to encrypted provider credentials.
--
-- The application now stores credentials through put_channel_credential. Its
-- channel-scoped uniqueness rule is a partial index, so this RPC deliberately
-- targets the matching predicate rather than relying on generic ON CONFLICT
-- inference in the application query builder.
--
-- Authenticated organization admins retain the existing tenant-scoped path.
-- The server-only service_role path is permitted because the application has
-- already encrypted the value and validates the channel/organization pair below.

CREATE OR REPLACE FUNCTION public.put_channel_credential(
  p_organization_id UUID,
  p_channel_id UUID,
  p_provider VARCHAR,
  p_credential_type VARCHAR,
  p_encrypted_value TEXT,
  p_status VARCHAR DEFAULT 'active'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_id UUID;
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_role <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
      RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = p_channel_id AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'channel_not_in_organization' USING ERRCODE='42501';
  END IF;

  IF p_encrypted_value IS NULL OR length(p_encrypted_value) < 16 THEN
    RAISE EXCEPTION 'credential_value_must_be_encrypted_by_the_application';
  END IF;

  IF p_status NOT IN ('active', 'disabled', 'expired') THEN
    RAISE EXCEPTION 'invalid_credential_status';
  END IF;

  INSERT INTO public.provider_credentials(
    organization_id, channel_id, provider, credential_type,
    encrypted_value, status, key_version, last_verified_at, updated_at
  )
  VALUES (
    p_organization_id, p_channel_id, p_provider, p_credential_type,
    p_encrypted_value, p_status, 1, NOW(), NOW()
  )
  ON CONFLICT (channel_id, provider, credential_type) WHERE channel_id IS NOT NULL
  DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    encrypted_value = EXCLUDED.encrypted_value,
    status = EXCLUDED.status,
    key_version = EXCLUDED.key_version,
    last_verified_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.put_channel_credential(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.put_channel_credential(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR) TO authenticated, service_role;
