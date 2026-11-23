-- Permit the QR / WhatsApp Web gateway as a distinct channel connection mode.
-- Keep existing Meta Cloud API and Coexistence modes unchanged.
ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_whatsapp_connection_mode_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_whatsapp_connection_mode_check
  CHECK (connection_mode IN ('cloud_api', 'coexistence', 'qr_unofficial'));
