-- 0028_notification_workflow_type.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_notification_type_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_notification_type_check;
  END IF;
END $$;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN ('assignment', 'handoff', 'high_priority', 'provider_error', 'workflow'));
