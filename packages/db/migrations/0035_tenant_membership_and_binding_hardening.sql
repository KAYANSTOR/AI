-- 0035_tenant_membership_and_binding_hardening.sql
-- Forward-only security hardening based on the database audit.
--
-- This migration deliberately does not rewrite an existing migration. It closes three
-- confirmed database-layer gaps:
--   1. deactivated members must not satisfy tenant helpers;
--   2. an authenticated user must not self-join an arbitrary organization;
--   3. active SMS channel bindings must resolve deterministically by To number.

-- ==========================================
-- 1. ACTIVE MEMBERS ARE THE ONLY TENANT MEMBERS
-- ==========================================
CREATE OR REPLACE FUNCTION private.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION private.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_members
      WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION private.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM organization_members
      WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND is_active = TRUE
        AND role IN ('owner', 'admin')
    );
$$;

-- Keep the public wrappers aligned with the private helpers used by RLS policies.
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ SELECT * FROM private.get_user_organizations(); $$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ SELECT private.is_org_member(org_id); $$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ SELECT private.is_org_admin(org_id); $$;

-- ==========================================
-- 2. MEMBERSHIP INSERTION IS INVITATION/ADMIN-OWNED
-- ==========================================
-- The previous policy allowed any authenticated user to insert themselves into any
-- organization whose UUID they knew, including with owner/admin role. Signup remains
-- server-owned by handle_new_user() (SECURITY DEFINER); normal clients must use the
-- future invitation/admin path rather than self-joining.
DROP POLICY IF EXISTS members_insert ON organization_members;
DROP POLICY IF EXISTS "members_insert" ON organization_members;
CREATE POLICY members_insert ON organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

-- ==========================================
-- 3. ACTIVE SMS TO-NUMBER BINDING
-- ==========================================
-- resolveChannelExact() resolves SMS by channel_type + external_identifier. Refuse to
-- install the uniqueness guarantee while duplicate active data exists; operators must
-- reconcile those rows explicitly and rerun this migration.
DO $$
DECLARE
  duplicate_count BIGINT;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT external_identifier
    FROM channels
    WHERE channel_type = 'sms'
      AND is_active = TRUE
      AND external_identifier IS NOT NULL
    GROUP BY external_identifier
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      '0035 SMS binding preflight failed: % duplicate active external_identifier value(s); reconcile before rerunning',
      duplicate_count
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_channels_sms_active_external_identifier
  ON channels (external_identifier)
  WHERE channel_type = 'sms'
    AND is_active = TRUE
    AND external_identifier IS NOT NULL;

-- ==========================================
-- 4. REASSERT PRODUCTION RPC/STATUS CONTRACT
-- ==========================================
-- 0030 already introduced this check. Reassert it here as a forward compatibility
-- repair for deployments whose schema is behind the application while their ledger says
-- otherwise. Do not silently coerce unknown values: reconciliation must be explicit.
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM channels
  WHERE verification_status IS NULL
     OR verification_status NOT IN ('pending', 'verified', 'failed', 'disabled', 'disconnected');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      '0035 channel verification preflight failed: % row(s) have an unsupported verification_status',
      invalid_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_verification_status_check;
ALTER TABLE channels ADD CONSTRAINT channels_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'failed', 'disabled', 'disconnected'));

-- These definitions match the published 0010/0012 contracts and are intentionally
-- repeated only as forward repair. The migration runner signals PostgREST after commit.
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
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_organization_id UUID,
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_business_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_member' USING ERRCODE = '42501';
  END IF;

  IF p_business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM businesses b
    WHERE b.id = p_business_id
      AND b.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'business_not_in_organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO audit_events(
    organization_id, business_id, actor_type, actor_id, action,
    entity_type, entity_id, metadata
  )
  VALUES (
    p_organization_id, p_business_id, 'user', auth.uid(), p_action,
    p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;

-- Reports used a direct organization_members join and therefore ignored is_active.
-- Recreate the policies through the canonical helper so deactivation applies uniformly.
DROP POLICY IF EXISTS "Users can view reports of their businesses" ON public.reports;
CREATE POLICY "Users can view reports of their businesses"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = reports.business_id
        AND public.is_org_member(b.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can create reports for their businesses" ON public.reports;
CREATE POLICY "Users can create reports for their businesses"
  ON public.reports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = reports.business_id
        AND public.is_org_member(b.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can update reports of their businesses" ON public.reports;
CREATE POLICY "Users can update reports of their businesses"
  ON public.reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = reports.business_id
        AND public.is_org_member(b.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = reports.business_id
        AND public.is_org_member(b.organization_id)
    )
  );

DROP POLICY IF EXISTS "Users can delete reports of their businesses" ON public.reports;
CREATE POLICY "Users can delete reports of their businesses"
  ON public.reports FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = reports.business_id
        AND public.is_org_member(b.organization_id)
    )
  );
