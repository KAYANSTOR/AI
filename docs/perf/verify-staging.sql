-- Run on STAGING after the deploy that applied 0041/0042. Read-only checks.
\echo '1) helper exists (expect 1):'
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='member_org_ids';
\echo '2) policies now using the helper (expect 55):'
select count(*) from pg_policies where schemaname='public' and qual like '%member_org_ids()%';
\echo '3) policies still calling is_org_member per row on a plain organization_id check (expect 0):'
select count(*) from pg_policies where schemaname='public' and regexp_replace(qual,'\s+',' ','g') = 'is_org_member(organization_id)';
\echo '4) new indexes (expect 3 rows):'
select indexname from pg_indexes where schemaname='public' and indexname in ('idx_outbox_events_due','idx_quotes_org_business_created','idx_orders_org_business_created');
\echo '5) isolation spot-check: replace the two UUIDs with a real member of org A and a user who is in NO org.'
\echo '   member should see only their org rows; outsider must see 0.'
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<MEMBER_USER_UUID>","role":"authenticated"}',true);
--   select set_config('request.jwt.claim.sub','<MEMBER_USER_UUID>',true);
--   select count(*), count(distinct organization_id) from contacts;
-- rollback;
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<OUTSIDER_USER_UUID>","role":"authenticated"}',true);
--   select set_config('request.jwt.claim.sub','<OUTSIDER_USER_UUID>',true);
--   select count(*) from contacts;   -- must be 0
-- rollback;
