-- Keep Meta Embedded Signup OAuth state nonces server-side and one-use.
-- Only the service role may insert or consume these short-lived records.
CREATE TABLE IF NOT EXISTS public.meta_embedded_signup_state_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nonce_hash text NOT NULL UNIQUE CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_embedded_signup_state_nonce_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_meta_embedded_signup_state_nonces_expires_at
  ON public.meta_embedded_signup_state_nonces (expires_at);

ALTER TABLE public.meta_embedded_signup_state_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_embedded_signup_state_nonces FROM anon, authenticated;
GRANT ALL ON TABLE public.meta_embedded_signup_state_nonces TO service_role;
