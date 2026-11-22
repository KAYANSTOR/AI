-- Phase 1: expand the canonical channel schema without enabling unimplemented providers.
-- Existing channel rows and their identifiers are preserved.
ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_channel_type_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_channel_type_check
  CHECK (
    channel_type IN (
      'phone',
      'whatsapp',
      'instagram',
      'website',
      'sms',
      'email',
      'telegram',
      'messenger'
    )
  );

-- Keep WhatsApp connection modes explicit. QR is intentionally marked unofficial
-- and remains a distinct mode from Meta Cloud API and Coexistence.
ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_whatsapp_connection_mode_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_whatsapp_connection_mode_check
  CHECK (connection_mode IN ('cloud_api', 'coexistence', 'qr_unofficial'));

-- The current channel management contract is one channel row per organization/type.
-- Preflight first: never delete, merge, or silently choose between duplicate rows.
DO $$
DECLARE
  duplicate_count BIGINT;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT organization_id, channel_type
    FROM public.channels
    GROUP BY organization_id, channel_type
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      '0062 channel uniqueness preflight failed: % duplicate organization/channel-type group(s); reconcile them before retrying',
      duplicate_count
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_channels_organization_channel_type
  ON public.channels (organization_id, channel_type);

-- Supports tenant-scoped channel inventory and health/status queries.
CREATE INDEX IF NOT EXISTS idx_channels_org_type_active
  ON public.channels (organization_id, channel_type, is_active);

CREATE INDEX IF NOT EXISTS idx_channels_type_connection_mode
  ON public.channels (channel_type, connection_mode)
  WHERE channel_type = 'whatsapp';
