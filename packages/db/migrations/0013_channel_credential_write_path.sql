-- Guarded write path for channel provider credentials.
--
-- 0012 made provider_credentials unreachable from client roles so the ciphertext can
-- never reach a browser. The dashboard still has to let an operator manage its own
-- credentials, so rather than reaching for the service-role key (which would bypass RLS
-- entirely) these functions are the only write path.
--
-- Each function:
--   * derives the tenant from membership and requires is_org_admin,
--   * verifies the channel belongs to that organization (no cross-tenant writes),
--   * stores the value already encrypted by the application, so
--     CREDENTIAL_ENCRYPTION_KEY never reaches the database,
--   * refuses to return encrypted_value back to the caller.

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM channels c
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

  INSERT INTO provider_credentials(organization_id, channel_id, provider, credential_type, encrypted_value, status, key_version, last_verified_at, updated_at)
  VALUES (p_organization_id, p_channel_id, p_provider, p_credential_type, p_encrypted_value, p_status, 1, NOW(), NOW())
  -- ux_provider_credentials_channel is a partial index, so conflict inference has to
  -- restate its predicate; without this PostgreSQL cannot match the arbiter index.
  ON CONFLICT (channel_id, provider, credential_type) WHERE channel_id IS NOT NULL
  DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value,
                status = EXCLUDED.status,
                last_verified_at = NOW(),
                updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_channel_credential_status(
  p_organization_id UUID,
  p_channel_id UUID,
  p_provider VARCHAR,
  p_status VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  IF p_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'invalid_credential_status';
  END IF;

  UPDATE provider_credentials
  SET status = p_status, updated_at = NOW()
  WHERE organization_id = p_organization_id AND channel_id = p_channel_id AND provider = p_provider;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential_not_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_channel_credential(
  p_organization_id UUID,
  p_channel_id UUID,
  p_provider VARCHAR,
  p_credential_type VARCHAR DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  DELETE FROM provider_credentials
  WHERE organization_id = p_organization_id
    AND channel_id = p_channel_id
    AND provider = p_provider
    AND (p_credential_type IS NULL OR credential_type = p_credential_type);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.put_channel_credential(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_channel_credential_status(UUID, UUID, VARCHAR, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_channel_credential(UUID, UUID, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.put_channel_credential(UUID, UUID, VARCHAR, VARCHAR, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_channel_credential_status(UUID, UUID, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_channel_credential(UUID, UUID, VARCHAR, VARCHAR) TO authenticated;
