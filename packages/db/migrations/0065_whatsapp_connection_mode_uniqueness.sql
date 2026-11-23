-- Keep one channel row per WhatsApp connection mode so QR/Web and Meta can coexist.
-- The expression preserves compatibility with legacy rows whose mode is still NULL.
DROP INDEX IF EXISTS public.ux_channels_organization_channel_type;

CREATE UNIQUE INDEX IF NOT EXISTS ux_channels_organization_channel_type_mode
  ON public.channels (organization_id, channel_type, COALESCE(connection_mode, 'cloud_api'));
