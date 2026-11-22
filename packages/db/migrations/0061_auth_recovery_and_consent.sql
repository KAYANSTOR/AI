-- Migration 0061: password recovery tokens and explicit signup consent.
-- Recovery tokens are stored only as SHA-256 hashes and are single-use.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_policy_version text;

CREATE TABLE IF NOT EXISTS public.auth_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_user_created_idx
  ON public.auth_password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_expiry_idx
  ON public.auth_password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.auth_password_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_password_reset_tokens FROM PUBLIC, anon, authenticated;
