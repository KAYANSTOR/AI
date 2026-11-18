-- Persist WABA mapping and Meta-confirmed WhatsApp connection mode.
-- Coexistence numbers are already registered by Meta during Embedded Signup.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS waba_id text,
  ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS primary_waac_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channels_whatsapp_connection_mode_check'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_whatsapp_connection_mode_check
      CHECK (connection_mode IN ('cloud_api', 'coexistence'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_channels_whatsapp_waba_id
  ON public.channels(waba_id)
  WHERE channel_type = 'whatsapp' AND waba_id IS NOT NULL;
