-- 0084: Google/Apple sign-in identities, e-mail verification, single-use e-mail
-- tokens (verify_email / reset_password) and an auth security log.
-- Scoped grants/policies only (no schema-wide revokes). Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Verified e-mail timestamp on accounts. Existing accounts stay unverified
--    (they see a dashboard banner) except those already proven by a reset link.
-- ---------------------------------------------------------------------------
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- Password-less accounts (OAuth) are allowed; password sign-in rejects a NULL hash.
ALTER TABLE auth.users ALTER COLUMN encrypted_password DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. External identities (Google / Apple). One provider subject maps to one user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_user_id text NOT NULL CHECK (char_length(provider_user_id) BETWEEN 1 AND 255),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT user_oauth_identities_provider_subject_key UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS user_oauth_identities_user_idx ON public.user_oauth_identities(user_id);

ALTER TABLE public.user_oauth_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_oauth_identities_own_select ON public.user_oauth_identities;
CREATE POLICY user_oauth_identities_own_select
  ON public.user_oauth_identities FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON TABLE public.user_oauth_identities FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.user_oauth_identities FROM authenticated;
GRANT SELECT ON TABLE public.user_oauth_identities TO authenticated;
GRANT ALL ON TABLE public.user_oauth_identities TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Single-use e-mail tokens. Only the SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_type text NOT NULL CHECK (token_type IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  email text NOT NULL CHECK (char_length(email) <= 254),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_email_tokens_expiry_after_create CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_email_tokens_user_type_idx
  ON public.auth_email_tokens(user_id, token_type, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_tokens_open_idx
  ON public.auth_email_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE public.auth_email_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_email_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_email_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Auth security log (reset requests/completions, verification, OAuth links).
--    Identifiers are hashed; no raw IPs or tokens.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z_]{3,60}$'),
  ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  email_hash text CHECK (email_hash IS NULL OR email_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_security_events_user_idx ON public.auth_security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_security_events_type_idx ON public.auth_security_events(event_type, created_at DESC);

ALTER TABLE public.auth_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_security_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auth_security_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Retire legacy reset tokens: any open 0061 token is closed; new resets use
--    public.auth_email_tokens (30-minute, single-use).
-- ---------------------------------------------------------------------------
UPDATE public.auth_password_reset_tokens SET used_at = now() WHERE used_at IS NULL;
