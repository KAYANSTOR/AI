-- Tenant-scoped audit write path for authenticated dashboard actions.
--
-- Root cause addressed here:
--   0005 gave audit_events a SELECT policy only. Every sensitive dashboard operation
--   that the plan requires to be audited — channel connect/disconnect, credential
--   change, agent change, prompt publish, human handoff, AI resume — therefore had no
--   legitimate write path from a user session. The only writer was the service-role
--   client used by the webhooks, which the dashboard must not depend on.
--
-- Opening audit_events to direct INSERT would let any member forge or mis-scope audit
-- rows. Instead this exposes one SECURITY DEFINER function that derives the tenant
-- from a membership check and forces actor_type='user' / actor_id=auth.uid(), so the
-- actor on an audit row can never be spoofed and cross-tenant writes are impossible.

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
SET search_path=public,pg_temp
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='28000';
  END IF;

  -- Membership is the tenant guard: a caller can only audit inside a tenant they belong to.
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_an_organization_member' USING ERRCODE='42501';
  END IF;

  IF p_business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM businesses b WHERE b.id = p_business_id AND b.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'business_not_in_organization' USING ERRCODE='42501';
  END IF;

  INSERT INTO audit_events(organization_id, business_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_organization_id, p_business_id, 'user', auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;
