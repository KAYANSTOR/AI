-- 0036_agent_governance_write_path_repair.sql
-- Forward repair for production databases whose migration ledger predates the
-- agent governance RPCs while the application already calls them.
--
-- Do not modify 0011: these definitions are the same application contract, restored
-- forward so PostgREST exposes the exact functions used by the Agent Management UI.

CREATE OR REPLACE FUNCTION public.publish_agent_prompt(
  p_agent_id UUID,
  p_system_prompt_addition TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_next INTEGER;
BEGIN
  SELECT organization_id
    INTO v_org
  FROM ai_agents
  WHERE id = p_agent_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next
  FROM agent_prompt_versions
  WHERE agent_id = p_agent_id;

  UPDATE agent_prompt_versions
  SET status = 'archived'
  WHERE agent_id = p_agent_id
    AND status = 'published';

  INSERT INTO agent_prompt_versions(
    agent_id,
    version,
    system_prompt_addition,
    status,
    created_by,
    published_at
  )
  VALUES (
    p_agent_id,
    v_next,
    NULLIF(btrim(COALESCE(p_system_prompt_addition, '')), ''),
    'published',
    auth.uid(),
    NOW()
  );

  UPDATE ai_agents
  SET updated_at = NOW()
  WHERE id = p_agent_id;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_agent_prompt(
  p_agent_id UUID,
  p_version INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_content TEXT;
BEGIN
  SELECT organization_id
    INTO v_org
  FROM ai_agents
  WHERE id = p_agent_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE = '42501';
  END IF;

  IF p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'invalid_prompt_version' USING ERRCODE = '22023';
  END IF;

  SELECT system_prompt_addition
    INTO v_content
  FROM agent_prompt_versions
  WHERE agent_id = p_agent_id
    AND version = p_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prompt_version_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.publish_agent_prompt(p_agent_id, v_content);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_tool_policy(
  p_agent_id UUID,
  p_tool_name TEXT,
  p_is_allowed BOOLEAN,
  p_requires_confirmation BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_tool_name TEXT;
  v_requires_confirmation BOOLEAN;
BEGIN
  v_tool_name := btrim(COALESCE(p_tool_name, ''));

  IF v_tool_name = '' OR length(v_tool_name) > 120 THEN
    RAISE EXCEPTION 'invalid_tool_name' USING ERRCODE = '22023';
  END IF;

  SELECT organization_id
    INTO v_org
  FROM ai_agents
  WHERE id = p_agent_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE = '42501';
  END IF;

  v_requires_confirmation := COALESCE(p_requires_confirmation, FALSE);

  INSERT INTO agent_tool_policies(
    agent_id,
    tool_name,
    is_allowed,
    requires_confirmation
  )
  VALUES (
    p_agent_id,
    v_tool_name,
    COALESCE(p_is_allowed, TRUE),
    v_requires_confirmation
  )
  ON CONFLICT (agent_id, tool_name)
  DO UPDATE SET
    is_allowed = EXCLUDED.is_allowed,
    requires_confirmation = EXCLUDED.requires_confirmation,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_agent_prompt(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_agent_prompt(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_agent_tool_policy(UUID, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.publish_agent_prompt(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_agent_prompt(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_tool_policy(UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
