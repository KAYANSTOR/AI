-- 0090: organizations.ignored_phones — inbound numbers that must never enter
-- the business funnel (F-003). The runtime checks this list before creating
-- any contact, conversation, message or SLA record.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ignored_phones text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.organizations.ignored_phones IS
  'Inbound phone numbers excluded from the business funnel; messages from them leave no business records.';
