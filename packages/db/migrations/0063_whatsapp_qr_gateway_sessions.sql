-- Durable storage for the unofficial WhatsApp Web gateway.
CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_sessions (
  channel_id uuid PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'starting'
    CHECK (status IN ('starting', 'qr_required', 'pairing_code', 'connected', 'reconnecting', 'disconnected', 'failed')),
  qr_data_url text,
  pairing_code text,
  auth_creds_ciphertext text,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_auth_keys (
  channel_id uuid NOT NULL REFERENCES public.whatsapp_gateway_sessions(channel_id) ON DELETE CASCADE,
  key_type text NOT NULL,
  key_id text NOT NULL,
  encrypted_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, key_type, key_id)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_gateway_sessions_status
  ON public.whatsapp_gateway_sessions (status, updated_at);
REVOKE ALL ON TABLE public.whatsapp_gateway_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.whatsapp_gateway_auth_keys FROM PUBLIC;
