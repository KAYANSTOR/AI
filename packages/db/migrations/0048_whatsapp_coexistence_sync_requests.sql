-- Track the one-time Coexistence contact and history sync requests sent to Meta.
-- Unique by channel + phone + sync type, so callback replays cannot re-request a sync.
CREATE TABLE IF NOT EXISTS public.whatsapp_coexistence_sync_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('smb_app_state_sync', 'history')),
  status text NOT NULL DEFAULT 'requesting'
    CHECK (status IN ('requesting', 'requested', 'failed', 'declined', 'completed')),
  request_id text,
  error_code integer,
  error_message text,
  last_progress integer CHECK (last_progress IS NULL OR (last_progress BETWEEN 0 AND 100)),
  last_phase integer,
  last_chunk_order integer,
  requested_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, phone_number_id, sync_type)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_coexistence_sync_requests_status
  ON public.whatsapp_coexistence_sync_requests (status, updated_at DESC);

ALTER TABLE public.whatsapp_coexistence_sync_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_coexistence_sync_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_coexistence_sync_requests TO service_role;
