-- Phase 3C: harden the free (trial) plan and the unified multimodal media pipeline.
--  * messages.media                      : normalized media metadata (kind/mime/size/transcript/description/name)
--  * plans.limits                         : free 40 AI replies/month (10/day), 5 media/month, 2 MB, 30 s, no documents
--  * ai_rate_limit_buckets.scope          : + 'contact' (4 AI calls/min per contact) and 'signup_ip'
--  * free_tier_usage                      : quota counters keyed by SHA-256 fingerprints (survive account deletion)
--  * free_tier_fingerprint_exemptions     : owner-console exemptions
--  * blocked_email_domains                : disposable e-mail domains rejected at signup
--  * consume_free_tier_quota()            : atomic, row-locked quota consumption
--
-- Privileges are granted per table only (no schema-wide REVOKE/GRANT). None of the new
-- tables is readable by anon/authenticated; trusted server code runs as service_role.

-- ---------------------------------------------------------------------------
-- 1. Media metadata on messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media JSONB;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_shape_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_shape_check
  CHECK (media IS NULL OR (jsonb_typeof(media) = 'object' AND octet_length(media::text) <= 16384));

-- ---------------------------------------------------------------------------
-- 2. Plan limits (editable later from owner-console)
-- ---------------------------------------------------------------------------
UPDATE public.plans SET limits = limits || jsonb_build_object(
  'ai_messages', 40, 'ai_messages_daily', 10, 'media_monthly', 5, 'media_max_mb', 2,
  'audio_max_seconds', 30, 'document_analysis', 0, 'max_input_chars', 500,
  'max_output_tokens', 180, 'flood_per_minute', 4), updated_at = now()
WHERE code = 'trial';

UPDATE public.plans SET limits = limits || jsonb_build_object(
  'media_max_mb', 5, 'audio_max_seconds', 60, 'document_analysis', 1,
  'max_input_chars', 2000, 'flood_per_minute', 4), updated_at = now()
WHERE code <> 'trial';

-- ---------------------------------------------------------------------------
-- 3. Rate-limit scopes
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_rate_limit_buckets DROP CONSTRAINT IF EXISTS ai_rate_limit_buckets_scope_check;
ALTER TABLE public.ai_rate_limit_buckets ADD CONSTRAINT ai_rate_limit_buckets_scope_check
  CHECK (scope IN ('user', 'organization', 'contact', 'signup_ip'));

-- ---------------------------------------------------------------------------
-- 4. Free-tier usage by fingerprint
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.free_tier_usage (
  fingerprint CHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  period_month DATE NOT NULL,
  ai_monthly INTEGER NOT NULL DEFAULT 0 CHECK (ai_monthly >= 0),
  ai_day DATE,
  ai_daily INTEGER NOT NULL DEFAULT 0 CHECK (ai_daily >= 0),
  media_monthly INTEGER NOT NULL DEFAULT 0 CHECK (media_monthly >= 0),
  last_organization_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fingerprint, period_month)
);

CREATE TABLE IF NOT EXISTS public.free_tier_fingerprint_exemptions (
  fingerprint CHAR(64) PRIMARY KEY CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  granted_by TEXT CHECK (granted_by IS NULL OR length(granted_by) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain TEXT PRIMARY KEY CHECK (domain ~ '^[a-z0-9.-]{3,253}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.blocked_email_domains (domain) VALUES
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('sharklasers.com'),
  ('10minutemail.com'), ('10minutemail.net'), ('temp-mail.org'), ('tempmail.com'),
  ('tempmail.net'), ('tempmailo.com'), ('throwawaymail.com'), ('yopmail.com'),
  ('yopmail.net'), ('getnada.com'), ('trashmail.com'), ('dispostable.com'),
  ('maildrop.cc'), ('fakeinbox.com'), ('mintemail.com'), ('mohmal.com'),
  ('emailondeck.com'), ('moakt.com'), ('tempr.email'), ('discard.email'),
  ('mailnesia.com'), ('spamgourmet.com'), ('burnermail.io'), ('1secmail.com'),
  ('emailfake.com'), ('temp-mail.io')
ON CONFLICT (domain) DO NOTHING;

ALTER TABLE public.free_tier_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_tier_fingerprint_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS free_tier_usage_service ON public.free_tier_usage;
CREATE POLICY free_tier_usage_service ON public.free_tier_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS free_tier_exemptions_service ON public.free_tier_fingerprint_exemptions;
CREATE POLICY free_tier_exemptions_service ON public.free_tier_fingerprint_exemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS blocked_email_domains_service ON public.blocked_email_domains;
CREATE POLICY blocked_email_domains_service ON public.blocked_email_domains
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.free_tier_usage FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.free_tier_fingerprint_exemptions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.blocked_email_domains FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.free_tier_usage TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.free_tier_fingerprint_exemptions TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.blocked_email_domains TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Atomic quota consumption
-- ---------------------------------------------------------------------------
-- Counts one AI reply ('ai') or one analyzed media item ('media') against every
-- non-exempt fingerprint. A call is allowed only when none of them is exhausted,
-- so deleting the account and signing up again with the same number does not reset
-- the quota. Rejected calls are not counted. p_daily_limit = 0 means no daily cap.
CREATE OR REPLACE FUNCTION public.consume_free_tier_quota(
  p_organization_id UUID,
  p_fingerprints TEXT[],
  p_kind TEXT,
  p_daily_limit INTEGER,
  p_monthly_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_subjects TEXT[];
  v_row public.free_tier_usage%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('ai', 'media') OR p_monthly_limit IS NULL OR p_monthly_limit < 0
     OR p_daily_limit IS NULL OR p_daily_limit < 0 THEN
    RAISE EXCEPTION 'invalid_quota_arguments';
  END IF;

  SELECT array_agg(DISTINCT f ORDER BY f) INTO v_subjects
    FROM unnest(COALESCE(p_fingerprints, ARRAY[]::TEXT[])) AS f
   WHERE f ~ '^[0-9a-f]{64}$'
     AND NOT EXISTS (SELECT 1 FROM public.free_tier_fingerprint_exemptions e WHERE e.fingerprint = f);

  IF v_subjects IS NULL OR cardinality(v_subjects) = 0 THEN
    -- Every fingerprint was exempted from owner-console (or none was supplied by trusted code).
    IF COALESCE(cardinality(p_fingerprints), 0) = 0 THEN
      RAISE EXCEPTION 'missing_fingerprints';
    END IF;
    RETURN QUERY SELECT TRUE, NULL::TEXT;
    RETURN;
  END IF;

  -- Rows are created and locked in a deterministic order to avoid deadlocks.
  INSERT INTO public.free_tier_usage (fingerprint, period_month, last_organization_id)
  SELECT s, v_month, p_organization_id FROM unnest(v_subjects) AS s
  ON CONFLICT (fingerprint, period_month) DO NOTHING;

  FOR v_row IN
    SELECT * FROM public.free_tier_usage u
     WHERE u.fingerprint = ANY (v_subjects) AND u.period_month = v_month
     ORDER BY u.fingerprint
     FOR UPDATE
  LOOP
    IF p_kind = 'media' THEN
      IF v_row.media_monthly >= p_monthly_limit THEN
        RETURN QUERY SELECT FALSE, 'media'::TEXT; RETURN;
      END IF;
    ELSE
      IF p_daily_limit > 0 AND v_row.ai_day = v_today AND v_row.ai_daily >= p_daily_limit THEN
        RETURN QUERY SELECT FALSE, 'daily'::TEXT; RETURN;
      END IF;
      IF v_row.ai_monthly >= p_monthly_limit THEN
        RETURN QUERY SELECT FALSE, 'monthly'::TEXT; RETURN;
      END IF;
    END IF;
  END LOOP;

  IF p_kind = 'media' THEN
    UPDATE public.free_tier_usage u
       SET media_monthly = u.media_monthly + 1, last_organization_id = p_organization_id, updated_at = now()
     WHERE u.fingerprint = ANY (v_subjects) AND u.period_month = v_month;
  ELSE
    UPDATE public.free_tier_usage u
       SET ai_monthly = u.ai_monthly + 1,
           ai_daily = CASE WHEN u.ai_day = v_today THEN u.ai_daily + 1 ELSE 1 END,
           ai_day = v_today,
           last_organization_id = p_organization_id,
           updated_at = now()
     WHERE u.fingerprint = ANY (v_subjects) AND u.period_month = v_month;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_free_tier_quota(UUID, TEXT[], TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_free_tier_quota(UUID, TEXT[], TEXT, INTEGER, INTEGER) TO service_role;

-- The per-contact flood and signup-IP buckets reuse consume_ai_rate_limit; make sure
-- only trusted server code can move those counters.
REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
