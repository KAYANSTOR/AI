-- Restores the original per-row policy expression for every policy rewritten by 0041.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual LIKE '%member_org_ids()%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I USING (is_org_member(organization_id))',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS private.member_org_ids();
