-- Owner presence: when the business owner replies manually from the WhatsApp
-- phone app, the agent pauses for a sliding window (default 30 minutes, renewed
-- on every manual message). When the window ends, unanswered customer messages
-- from the last 24 hours are queued once for the agent (catch-up).
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS human_takeover_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS human_takeover_pause_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS human_takeover_scope TEXT NOT NULL DEFAULT 'channel',
  ADD COLUMN IF NOT EXISTS human_paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_human_outbound_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'channels_human_takeover_pause_minutes_check'
       AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_human_takeover_pause_minutes_check
      CHECK (human_takeover_pause_minutes BETWEEN 1 AND 1440);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'channels_human_takeover_scope_check'
       AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_human_takeover_scope_check
      CHECK (human_takeover_scope IN ('channel', 'conversation'));
  END IF;
END $$;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS human_paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_human_outbound_at TIMESTAMPTZ;

-- The worker scans only rows whose pause is set.
CREATE INDEX IF NOT EXISTS idx_channels_human_paused_until
  ON public.channels (human_paused_until)
  WHERE human_paused_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_human_paused_until
  ON public.conversations (human_paused_until)
  WHERE human_paused_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_channel_last_inbound
  ON public.conversations (channel_id, last_inbound_at DESC)
  WHERE last_inbound_at IS NOT NULL;
