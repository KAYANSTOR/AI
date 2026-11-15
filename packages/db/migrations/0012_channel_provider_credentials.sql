-- Channel-scoped, server-only provider credentials.
--
-- Root causes addressed here:
--   1. `cred_select` (0001) let any organization admin SELECT `encrypted_value`
--      straight from the browser through PostgREST. Ciphertext in the client is not an
--      acceptable place for provider credentials: it hands every admin the blobs to
--      attack offline and means the value is one leaked key away from plaintext.
--      Credentials must never leave the server, so the table becomes unreachable from
--      client roles and the UI gets a metadata-only projection instead.
--   2. The table had no channel scope at all, so a single row per organization was the
--      only shape available — which is exactly how a tenant ends up sharing one
--      provider token across every business.
--
-- The encrypted value itself is produced by the application (AES-256-GCM with
-- CREDENTIAL_ENCRYPTION_KEY) so the key never reaches the database.

-- 1. Channel scope ---------------------------------------------------------------
ALTER TABLE provider_credentials
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_credentials_channel_id_fkey') THEN
    ALTER TABLE provider_credentials ADD CONSTRAINT provider_credentials_channel_id_fkey
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_credentials_channel ON provider_credentials(channel_id);
CREATE INDEX IF NOT EXISTS idx_provider_credentials_org ON provider_credentials(organization_id, provider);

-- A channel can hold at most one credential of a given type; an organization-level
-- (channel-less) row keeps the same guarantee for operator-managed deployments.
CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_credentials_channel
  ON provider_credentials(channel_id, provider, credential_type)
  WHERE channel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_credentials_org_level
  ON provider_credentials(organization_id, provider, credential_type)
  WHERE channel_id IS NULL;

-- 2. Server-only: remove every client path to the ciphertext -----------------------
DROP POLICY IF EXISTS "cred_select" ON provider_credentials;
DROP POLICY IF EXISTS "cred_insert" ON provider_credentials;
DROP POLICY IF EXISTS "cred_update" ON provider_credentials;
DROP POLICY IF EXISTS "cred_delete" ON provider_credentials;

REVOKE ALL ON provider_credentials FROM anon, authenticated;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;

-- 3. Metadata-only projection for the dashboard -----------------------------------
-- Admins can see that a credential exists, which provider/type it is, whether it is
-- active and when it was last verified — never the value, not even the ciphertext.
CREATE OR REPLACE FUNCTION public.list_channel_credential_metadata(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  channel_id UUID,
  provider VARCHAR,
  credential_type VARCHAR,
  status VARCHAR,
  key_version INTEGER,
  last_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT pc.id, pc.channel_id, pc.provider::VARCHAR, pc.credential_type::VARCHAR,
         pc.status::VARCHAR, pc.key_version, pc.last_verified_at, pc.expires_at, pc.updated_at
  FROM provider_credentials pc
  WHERE pc.organization_id = p_organization_id
  ORDER BY pc.provider, pc.credential_type;
END;
$$;

REVOKE ALL ON FUNCTION public.list_channel_credential_metadata(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_channel_credential_metadata(UUID) TO authenticated;
