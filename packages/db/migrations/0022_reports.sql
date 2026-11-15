-- Migration: 0022_reports
-- Description: Adds saved and scheduled reports capabilities for Phase 4.2

-- 1. Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    report_type text NOT NULL, -- e.g., 'analytics', 'conversations', 'leads', 'orders'
    config jsonb NOT NULL DEFAULT '{}'::jsonb, -- Stores filters, columns, sorting, etc.
    schedule_cron text, -- e.g., '0 9 * * 1' for weekly on Monday at 9am
    email_recipients text[], -- Array of emails to send the scheduled report to
    last_run_at timestamptz,
    next_run_at timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Create indexes
CREATE INDEX idx_reports_business_id ON public.reports(business_id);
CREATE INDEX idx_reports_type ON public.reports(report_type);
CREATE INDEX idx_reports_schedule ON public.reports(schedule_cron) WHERE schedule_cron IS NOT NULL AND is_active = true;

-- 3. Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view reports of their businesses"
    ON public.reports FOR SELECT
    USING (
        business_id IN (
            SELECT b.id FROM public.businesses b
            JOIN public.organization_members om ON b.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create reports for their businesses"
    ON public.reports FOR INSERT
    WITH CHECK (
        business_id IN (
            SELECT b.id FROM public.businesses b
            JOIN public.organization_members om ON b.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update reports of their businesses"
    ON public.reports FOR UPDATE
    USING (
        business_id IN (
            SELECT b.id FROM public.businesses b
            JOIN public.organization_members om ON b.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete reports of their businesses"
    ON public.reports FOR DELETE
    USING (
        business_id IN (
            SELECT b.id FROM public.businesses b
            JOIN public.organization_members om ON b.organization_id = om.organization_id
            WHERE om.user_id = auth.uid()
        )
    );

-- 5. Add trigger for updated_at
CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
