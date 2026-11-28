-- OPS-003 / OPS-007 — safe operational metrics for the inbound queue and an
-- explicit terminal state for outbound sends whose provider outcome is unknown.
--
-- Additive only; apply through the migration runner. No table is rewritten and
-- no existing event row is deleted or marked successful.

ALTER TABLE public.inbound_jobs
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER CHECK (queue_wait_ms IS NULL OR queue_wait_ms >= 0),
  ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER CHECK (processing_duration_ms IS NULL OR processing_duration_ms >= 0),
  ADD COLUMN IF NOT EXISTS model_duration_ms INTEGER CHECK (model_duration_ms IS NULL OR model_duration_ms >= 0),
  ADD COLUMN IF NOT EXISTS outbound_duration_ms INTEGER CHECK (outbound_duration_ms IS NULL OR outbound_duration_ms >= 0),
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
    CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'queued', 'blocked', 'none')),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER CHECK (retry_count IS NULL OR retry_count >= 0),
  ADD COLUMN IF NOT EXISTS deduplication_result TEXT
    CHECK (deduplication_result IS NULL OR deduplication_result IN ('unique', 'duplicate_suppressed', 'duplicate_resumed'));

-- Existing rows keep NULL metrics; the correlation id is derived without exposing
-- any payload content.
UPDATE public.inbound_jobs SET correlation_id = id WHERE correlation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_jobs_metrics
  ON public.inbound_jobs (completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- `provider_attempted_at` is written immediately before a provider call. A row in
-- `processing` with it set has an unknown provider outcome and must never be sent
-- again automatically; reconciliation resolves it to `unconfirmed`.
ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS provider_attempted_at TIMESTAMPTZ;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.outbox_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pending%'
    AND pg_get_constraintdef(oid) LIKE '%cancelled%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.outbox_events DROP CONSTRAINT %I', constraint_name);
  END IF;
  ALTER TABLE public.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
  ALTER TABLE public.outbox_events
    ADD CONSTRAINT outbox_events_status_check CHECK (
      status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'cancelled', 'unconfirmed')
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_outbox_events_unconfirmed
  ON public.outbox_events (updated_at DESC)
  WHERE status = 'unconfirmed';
