-- Per-user, per-workspace and per-guide-version progress. Not a permission grant.
CREATE TABLE IF NOT EXISTS public.dashboard_tour_progress (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_version integer NOT NULL CHECK (tour_version > 0),
  track text NOT NULL CHECK (track IN ('commercial', 'personal', 'personal_unavailable')),
  step_id text NOT NULL CHECK (step_id ~ '^[a-z][a-z_]{0,39}$'),
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, tour_version, track)
);
ALTER TABLE public.dashboard_tour_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_tour_read ON public.dashboard_tour_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY dashboard_tour_insert ON public.dashboard_tour_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY dashboard_tour_update ON public.dashboard_tour_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
REVOKE ALL ON TABLE public.dashboard_tour_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dashboard_tour_progress TO authenticated;
