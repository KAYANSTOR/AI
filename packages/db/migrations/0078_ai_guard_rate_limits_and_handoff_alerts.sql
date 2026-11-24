-- DB-backed AI usage guard (F3). Rate-limit counters live in PostgreSQL so every
-- Railway replica enforces the same per-user and per-organization hourly budget.
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_buckets (
  scope TEXT NOT NULL CHECK (scope IN ('user', 'organization')),
  subject_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limit_buckets_window
  ON public.ai_rate_limit_buckets (window_start);

ALTER TABLE public.ai_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_rate_limit_buckets TO service_role;

-- Atomically counts one AI call for a bucket and reports whether it is still allowed.
-- A rejected call is not counted, so a caller hammering the endpoint does not extend
-- its own lockout beyond the current window.
CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(
  p_scope TEXT,
  p_subject_id TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE (allowed BOOLEAN, hits INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_hits INTEGER;
BEGIN
  INSERT INTO public.ai_rate_limit_buckets AS b (scope, subject_id, window_start, hits, updated_at)
  VALUES (p_scope, p_subject_id, v_window, 1, now())
  ON CONFLICT (scope, subject_id, window_start)
  DO UPDATE SET hits = b.hits + 1, updated_at = now()
  WHERE b.hits < p_limit
  RETURNING b.hits INTO v_hits;

  IF v_hits IS NULL THEN
    SELECT b.hits INTO v_hits FROM public.ai_rate_limit_buckets b
     WHERE b.scope = p_scope AND b.subject_id = p_subject_id AND b.window_start = v_window;
    RETURN QUERY SELECT FALSE, COALESCE(v_hits, p_limit), v_window + make_interval(secs => p_window_seconds);
    RETURN;
  END IF;

  -- Opportunistic cleanup of old windows keeps the table small without a cron.
  IF random() < 0.01 THEN
    DELETE FROM public.ai_rate_limit_buckets WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT v_hits <= p_limit, v_hits, v_window + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Optional dedicated phone for human-handoff WhatsApp alerts; falls back to the
-- organization owner's login phone when empty.
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS handoff_alert_phone TEXT;
