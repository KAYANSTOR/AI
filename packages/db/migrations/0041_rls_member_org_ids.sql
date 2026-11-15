-- Approved for STAGING first (docs/perf/STAGING_RUNBOOK.md). Rollback: docs/perf/rollback/.
-- Note: railway.json runs `npm run db:migrate` before every deploy.
--
-- Problem: 55 RLS policies are `USING (is_org_member(organization_id))`. That helper is a
-- SECURITY DEFINER SQL function, so Postgres cannot inline it and calls it once PER ROW
-- (each call parses the JWT claims and probes organization_members). A 30k-row exact count
-- took ~1.8 s; the 12-count dashboard overview took ~3.2 s.
--
-- Fix: expose the caller's active organizations as a set and compare against it. The
-- uncorrelated sub-select is evaluated once per statement (hashed SubPlan), not per row.
-- Semantics are identical to is_org_member(): same table, same `is_active` condition, same
-- auth.uid() source; a NULL uid or NULL organization_id yields no access in both.
--
-- Scope: ONLY policies whose qual is exactly `is_org_member(organization_id)`. Policies with
-- extra conditions, EXISTS-joins, WITH CHECK expressions and is_org_admin() are untouched.

CREATE OR REPLACE FUNCTION private.member_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE auth.uid() IS NOT NULL
    AND om.user_id = auth.uid()
    AND om.is_active = TRUE
$$;

REVOKE ALL ON FUNCTION private.member_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.member_org_ids() TO authenticated, service_role;

DO $$
DECLARE
  r record;
  rewritten integer := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND regexp_replace(qual, '\s+', ' ', 'g') = 'is_org_member(organization_id)'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING (organization_id IN (SELECT private.member_org_ids()))',
      r.policyname, r.schemaname, r.tablename
    );
    rewritten := rewritten + 1;
  END LOOP;
  RAISE NOTICE 'member_org_ids: rewrote % policies', rewritten;
END $$;
