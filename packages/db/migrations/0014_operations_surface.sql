-- 0014_operations_surface.sql
-- Forward-only. Adds the storage the operational surfaces need:
--   * knowledge_base   -> activation + category so entries can be curated and retired
--   * business_hour_exceptions -> holidays / one-off opening changes used by availability
--   * conversation_notes -> internal notes written by staff (never sent to the customer)
-- No existing column, policy or constraint is rewritten.

-- ==========================================
-- 1. KNOWLEDGE BASE CURATION
-- ==========================================
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'general';
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_active
  ON knowledge_base(organization_id, category) WHERE is_active;

-- ==========================================
-- 2. BUSINESS HOUR EXCEPTIONS (HOLIDAYS)
-- ==========================================
-- Availability must be able to answer "are you open on this specific date", which the
-- weekly business_hours rows cannot express on their own.
CREATE TABLE IF NOT EXISTS business_hour_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- NULL means the exception applies to the whole organization.
    location_id UUID REFERENCES business_locations(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME,
    close_time TIME,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (is_closed OR (open_time IS NOT NULL AND close_time IS NOT NULL))
);

-- NULL locations are distinct in a plain UNIQUE constraint, so enforce the organisation-wide
-- case explicitly with two partial unique indexes instead of weakening the check.
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_hour_exception_location
  ON business_hour_exceptions(organization_id, location_id, exception_date) WHERE location_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_hour_exception_org
  ON business_hour_exceptions(organization_id, exception_date) WHERE location_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_hour_exception_lookup
  ON business_hour_exceptions(organization_id, exception_date);

ALTER TABLE business_hour_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bhe_select ON business_hour_exceptions;
CREATE POLICY bhe_select ON business_hour_exceptions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS bhe_insert ON business_hour_exceptions;
CREATE POLICY bhe_insert ON business_hour_exceptions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS bhe_update ON business_hour_exceptions;
CREATE POLICY bhe_update ON business_hour_exceptions FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
DROP POLICY IF EXISTS bhe_delete ON business_hour_exceptions;
CREATE POLICY bhe_delete ON business_hour_exceptions FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- ==========================================
-- 3. CONVERSATION NOTES (INTERNAL ONLY)
-- ==========================================
-- Separate from `messages` on purpose: a note is staff context, not customer traffic, and
-- must never be routed through the outbox.
CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    author_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation
  ON conversation_notes(conversation_id, created_at DESC);

ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cnote_select ON conversation_notes;
CREATE POLICY cnote_select ON conversation_notes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
-- A member may only author a note in their own tenant and only as themselves.
DROP POLICY IF EXISTS cnote_insert ON conversation_notes;
CREATE POLICY cnote_insert ON conversation_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.id = conversation_notes.author_id
        AND m.organization_id = conversation_notes.organization_id
        AND m.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS cnote_delete ON conversation_notes;
CREATE POLICY cnote_delete ON conversation_notes FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- Reuse the guarded audit path (0010) for the new admin-only knowledge changes.
CREATE OR REPLACE FUNCTION public.holiday_aware_hours(
  p_organization_id UUID,
  p_location_id UUID,
  p_day DATE
)
RETURNS TABLE(is_closed BOOLEAN, open_time TIME, close_time TIME)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_exception RECORD;
  v_hours RECORD;
BEGIN
  -- A date-scoped exception always wins over the weekly schedule.
  SELECT e.is_closed, e.open_time, e.close_time INTO v_exception
  FROM business_hour_exceptions e
  WHERE e.organization_id = p_organization_id
    AND e.exception_date = p_day
    AND (e.location_id IS NULL OR e.location_id = p_location_id)
  ORDER BY (e.location_id IS NOT NULL) DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_exception.is_closed, v_exception.open_time, v_exception.close_time;
    RETURN;
  END IF;

  SELECT h.is_closed, h.open_time, h.close_time INTO v_hours
  FROM business_hours h
  WHERE h.organization_id = p_organization_id
    AND h.day_of_week = EXTRACT(DOW FROM p_day)::INTEGER
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_hours.is_closed, v_hours.open_time, v_hours.close_time;
    RETURN;
  END IF;

  -- No configured hours means closed: availability is never assumed.
  RETURN QUERY SELECT TRUE, NULL::TIME, NULL::TIME;
END;
$$;

REVOKE ALL ON FUNCTION public.holiday_aware_hours(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.holiday_aware_hours(UUID, UUID, DATE) TO authenticated;
