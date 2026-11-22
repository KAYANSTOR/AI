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

-- Supports tenant-scoped channel inventory and health/status queries.
CREATE INDEX IF NOT EXISTS idx_channels_org_type_active
  ON public.channels (organization_id, channel_type, is_active);

CREATE INDEX IF NOT EXISTS idx_channels_type_connection_mode
  ON public.channels (channel_type, connection_mode)
  WHERE channel_type = 'whatsapp';
