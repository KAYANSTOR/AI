-- Durable inbound queue for provider webhooks, including WhatsApp Web.
-- The HTTP endpoint only records the event and enqueues work; AI and delivery
-- happen in a separate worker process.
CREATE TABLE IF NOT EXISTS public.inbound_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  webhook_event_id UUID REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inbound_jobs_due
  ON public.inbound_jobs (available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_inbound_jobs_processing
  ON public.inbound_jobs (locked_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_inbound_jobs_status_created
  ON public.inbound_jobs (status, created_at);

CREATE OR REPLACE FUNCTION public.claim_inbound_job(p_worker TEXT)
RETURNS SETOF public.inbound_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.inbound_jobs
    WHERE status = 'queued'
      AND available_at <= now()
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.inbound_jobs AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      locked_by = LEFT(COALESCE(p_worker, 'unknown'), 120),
      updated_at = now()
  FROM candidate
  WHERE job.id = candidate.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_inbound_jobs(p_stale_after_seconds INTEGER DEFAULT 300)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recovered INTEGER;
BEGIN
  UPDATE public.inbound_jobs
  SET status = 'queued',
      available_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error = COALESCE(last_error, 'worker_stale_recovered'),
      updated_at = now()
  WHERE status = 'processing'
    AND locked_at < now() - make_interval(secs => GREATEST(30, p_stale_after_seconds));
  GET DIAGNOSTICS recovered = ROW_COUNT;
  RETURN recovered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_inbound_job(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_inbound_jobs(INTEGER) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_inbound_job(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recover_stale_inbound_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
ALTER TABLE public.inbound_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inbound_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inbound_jobs TO service_role;
