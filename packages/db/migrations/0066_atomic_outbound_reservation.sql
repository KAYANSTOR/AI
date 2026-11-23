-- WhatsApp adapter routing and atomic outbound reservation.
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_whatsapp_connection_mode_check;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_whatsapp_connection_mode_check
  CHECK (connection_mode IN ('cloud_api', 'coexistence', 'qr_unofficial'));

CREATE OR REPLACE FUNCTION public.reserve_outbound_event(
  p_organization_id uuid,
  p_business_id uuid,
  p_channel_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_recipient text,
  p_payload jsonb
)
RETURNS TABLE(event_id uuid, status text, attempts integer, scheduled_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.outbox_events%ROWTYPE;
  inserted boolean := false;
  quota_limit numeric;
  used numeric;
BEGIN
  -- Serialize reservations per organization so quota cannot be overspent by
  -- concurrent webhooks. The provider is never called in this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':message_outbound', 0));

  SELECT * INTO existing
    FROM public.outbox_events
   WHERE organization_id = p_organization_id
     AND idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT be.limit_value INTO quota_limit
      FROM public.billing_entitlements be
     WHERE be.organization_id = p_organization_id
       AND be.feature_key = 'campaign_sends'
       AND be.enabled = true
       AND be.period IN ('monthly', 'unlimited')
     LIMIT 1;

    IF quota_limit IS NOT NULL AND quota_limit >= 0 THEN
      SELECT COALESCE(SUM(units), 0) INTO used
        FROM public.usage_ledger
       WHERE organization_id = p_organization_id
         AND event_type = 'message_outbound'
         AND occurred_at >= date_trunc('month', now());
      IF used + 1 > quota_limit THEN
        RAISE EXCEPTION 'outbound_quota_exceeded';
      END IF;
    END IF;

    INSERT INTO public.outbox_events(
      organization_id, business_id, channel_id, event_type, idempotency_key,
      recipient, payload, status, scheduled_at
    ) VALUES (
      p_organization_id, p_business_id, p_channel_id, p_event_type,
      p_idempotency_key, p_recipient, p_payload, 'pending', now()
    ) RETURNING * INTO existing;
    inserted := true;

    INSERT INTO public.usage_ledger(
      organization_id, business_id, event_type, units, reference_type,
      reference_id, metadata
    ) VALUES (
      p_organization_id, p_business_id, 'message_outbound', 1, 'channel',
      p_channel_id, jsonb_build_object('idempotency_key', p_idempotency_key, 'reserved', true)
    );
  END IF;

  IF NOT inserted AND existing.status IN ('pending', 'failed')
     AND existing.scheduled_at <= now()
     AND existing.attempts < 8 THEN
    UPDATE public.outbox_events
       SET status = 'processing', attempts = attempts + 1,
           locked_at = now(), updated_at = now()
     WHERE id = existing.id;
    SELECT * INTO existing FROM public.outbox_events WHERE id = existing.id;
  END IF;

  RETURN QUERY SELECT existing.id, existing.status, existing.attempts, existing.scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_outbound_event(uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_outbound_event(uuid, uuid, uuid, text, text, text, jsonb) TO service_role;
