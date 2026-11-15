-- Keep channel status values aligned with the dashboard channel actions.
-- The disconnect action uses `disconnected`; older deployments only allowed
-- pending/verified/failed/disabled and rejected the update at runtime.

ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_verification_status_check;

ALTER TABLE channels ADD CONSTRAINT channels_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'failed', 'disabled', 'disconnected'));
