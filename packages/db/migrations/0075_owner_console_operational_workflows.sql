-- Owner Console operational workflows. Additive PostgreSQL-only migration.
-- Existing production tables and customer records are preserved.

CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  opened_by_admin_id UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_status_created
  ON public.platform_support_tickets(status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('all_users','plan_tier','trial_users','expiring_soon')),
  target_filter TEXT,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  recipients_count INTEGER NOT NULL DEFAULT 0 CHECK (recipients_count >= 0),
  sent_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_created
  ON public.platform_announcements(created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_alert_acknowledgements (
  alert_id TEXT PRIMARY KEY,
  acknowledged_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_log_resolutions (
  source TEXT NOT NULL,
  log_id TEXT NOT NULL,
  resolved_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(source,log_id)
);

ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_alert_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_log_resolutions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_support_tickets,public.platform_announcements,
  public.platform_alert_acknowledgements,public.platform_log_resolutions
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.platform_support_tickets,public.platform_announcements,
  public.platform_alert_acknowledgements,public.platform_log_resolutions
  TO service_role;
