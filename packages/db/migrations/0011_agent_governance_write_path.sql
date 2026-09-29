-- Guarded write path for agent governance: prompt versions and tool policies.
--
-- Root cause addressed here:
--   0005 gave agent_prompt_versions and agent_tool_policies a SELECT policy only, and
--   0000 gave ai_agents full owner/admin CRUD. So the Agent Management surface could
--   rename an agent but could never publish a prompt version, roll one back, or change
--   a tool policy — the exact operations docs/PLAN.md requires ("Agent governance",
--   "Every tool has schema, capability, risk, permission, confirmation").
--
-- Direct INSERT/UPDATE on those tables would let a member with no governance role edit
-- what the AI is allowed to do. These functions therefore re-derive the tenant from the
-- agent row and require is_org_admin, on top of RLS.

-- 1. Publish a new prompt version (append-only history) ---------------------------
CREATE OR REPLACE FUNCTION public.publish_agent_prompt(
  p_agent_id UUID,
  p_system_prompt_addition TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_org UUID;
  v_next INTEGER;
BEGIN
  SELECT organization_id INTO v_org FROM ai_agents WHERE id = p_agent_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM agent_prompt_versions WHERE agent_id = p_agent_id;

  -- Only one published version may exist (ux_agent_prompt_published), so retire the
  -- current one first. History is never deleted.
  UPDATE agent_prompt_versions
  SET status = 'archived'
  WHERE agent_id = p_agent_id AND status = 'published';

  INSERT INTO agent_prompt_versions(agent_id, version, system_prompt_addition, status, created_by, published_at)
  VALUES (p_agent_id, v_next, NULLIF(btrim(COALESCE(p_system_prompt_addition, '')), ''), 'published', auth.uid(), NOW());

  UPDATE ai_agents SET updated_at = NOW() WHERE id = p_agent_id;

  RETURN v_next;
END;
$$;

-- 2. Roll back by republishing an earlier version's content ------------------------
-- Rollback appends a new version rather than flipping statuses, so the published
-- history stays append-only and an audit row always points at a real version.
CREATE OR REPLACE FUNCTION public.rollback_agent_prompt(
  p_agent_id UUID,
  p_version INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_org UUID;
  v_content TEXT;
BEGIN
  SELECT organization_id INTO v_org FROM ai_agents WHERE id = p_agent_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  SELECT system_prompt_addition INTO v_content
  FROM agent_prompt_versions
  WHERE agent_id = p_agent_id AND version = p_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prompt_version_not_found';
  END IF;

  RETURN public.publish_agent_prompt(p_agent_id, v_content);
END;
$$;

-- 3. Tool policy per agent ---------------------------------------------------------
-- p_tool_name is not constrained to the registry here: the registry lives in
-- lib/ai/registry.ts and is the single source of truth, and the tool executor already
-- refuses any name it does not know. This table only stores per-agent overrides.
CREATE OR REPLACE FUNCTION public.set_agent_tool_policy(
  p_agent_id UUID,
  p_tool_name TEXT,
  p_is_allowed BOOLEAN,
  p_requires_confirmation BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF p_tool_name IS NULL OR btrim(p_tool_name) = '' OR length(p_tool_name) > 120 THEN
    RAISE EXCEPTION 'invalid_tool_name';
  END IF;

  SELECT organization_id INTO v_org FROM ai_agents WHERE id = p_agent_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agent_not_found' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'not_an_organization_admin' USING ERRCODE='42501';
  END IF;

  INSERT INTO agent_tool_policies(agent_id, tool_name, is_allowed, requires_confirmation)
  VALUES (p_agent_id, btrim(p_tool_name), COALESCE(p_is_allowed, TRUE), COALESCE(p_requires_confirmation, FALSE))
  ON CONFLICT (agent_id, tool_name)
  DO UPDATE SET is_allowed = EXCLUDED.is_allowed,
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
