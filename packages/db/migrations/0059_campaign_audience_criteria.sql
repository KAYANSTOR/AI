-- Persist an explicit audience definition for each campaign.
-- NULL remains intentionally empty for legacy campaigns: they must not silently
-- expand to all contacts when started.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS audience_criteria JSONB;

COMMENT ON COLUMN campaigns.audience_criteria IS
  'Explicit audience criteria used when segment_id is null; NULL means no audience is configured.';
