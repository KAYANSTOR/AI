-- Atomic webhook claiming and bounded recovery.
-- The previous unique-key insert treated every redelivery as a duplicate, including
-- events whose earlier processing had failed. This migration makes event state explicit
-- and provides one atomic claim operation for all channel webhook handlers.

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_processing_status_check;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_webhook_events_recovery
  ON public.webhook_events(processing_status, processing_started_at, received_at)
  WHERE processing_status IN ('pending', 'processing', 'failed');

CREATE OR REPLACE FUNCTION public.claim_webhook_event(
  p_provider text,
  p_external_event_id text,
  p_payload jsonb,
  p_stale_after_seconds integer DEFAULT 300
)
RETURNS TABLE(event_row_id uuid, claimed boolean, current_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_id uuid;
  v_status text;
BEGIN
  IF NULLIF(btrim(p_provider), '') IS NULL
     OR NULLIF(btrim(p_external_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'provider_and_external_event_id_required';
  END IF;

  INSERT INTO public.webhook_events (
    provider,
    external_event_id,
    payload,
    processing_status,
    attempt_count,
    processing_started_at,
    received_at
  )
  VALUES (
    btrim(p_provider),
    btrim(p_external_event_id),
    COALESCE(p_payload, '{}'::jsonb),
    'processing',
    1,
    now(),
    now()
  )
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT v_event_id, true, 'processing'::text;
    RETURN;
  END IF;

  UPDATE public.webhook_events AS event
     SET processing_status = 'processing',
         attempt_count = event.attempt_count + 1,
         processing_started_at = now(),
         processed_at = NULL,
         error_message = NULL,
         payload = COALESCE(p_payload, event.payload)
   WHERE event.provider = btrim(p_provider)
     AND event.external_event_id = btrim(p_external_event_id)
     AND (
       event.processing_status IN ('pending', 'failed')
       OR (
         event.processing_status = 'processing'
         AND COALESCE(event.processing_started_at, event.received_at)
             <= now() - make_interval(secs => GREATEST(COALESCE(p_stale_after_seconds, 300), 30))
       )
     )
  RETURNING event.id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT v_event_id, true, 'processing'::text;
    RETURN;
  END IF;

  SELECT event.id, event.processing_status
    INTO v_event_id, v_status
    FROM public.webhook_events AS event
   WHERE event.provider = btrim(p_provider)
     AND event.external_event_id = btrim(p_external_event_id);

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY SELECT v_event_id, false, v_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_webhook_event(text, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event(text, text, jsonb, integer)
  TO service_role;
