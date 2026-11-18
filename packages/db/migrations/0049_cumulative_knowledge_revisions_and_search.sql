-- Cumulative knowledge: immutable content identity, indexed retrieval, and revision history.
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_base_org_content_hash ON public.knowledge_base (organization_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_active_updated ON public.knowledge_base (organization_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_search_vector ON public.knowledge_base USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS public.knowledge_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  knowledge_id UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  change_type VARCHAR(20) NOT NULL DEFAULT 'update' CHECK (change_type IN ('update', 'restore', 'archive', 'activate')),
  change_reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (knowledge_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_revisions_org_knowledge ON public.knowledge_revisions (organization_id, knowledge_id, revision_number DESC);
ALTER TABLE public.knowledge_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_revisions_select ON public.knowledge_revisions;
CREATE POLICY knowledge_revisions_select ON public.knowledge_revisions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS knowledge_revisions_insert ON public.knowledge_revisions;
CREATE POLICY knowledge_revisions_insert ON public.knowledge_revisions FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
GRANT SELECT, INSERT ON public.knowledge_revisions TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_knowledge_with_revision(
  p_organization_id UUID, p_knowledge_id UUID, p_title TEXT, p_content TEXT,
  p_category TEXT, p_change_reason TEXT DEFAULT NULL, p_change_type TEXT DEFAULT 'update'
) RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_row public.knowledge_base%ROWTYPE; next_revision INTEGER;
BEGIN
  IF p_change_type NOT IN ('update', 'restore', 'archive', 'activate') THEN RAISE EXCEPTION 'Invalid knowledge change type'; END IF;
  SELECT * INTO current_row FROM public.knowledge_base
   WHERE id = p_knowledge_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge entry not found'; END IF;
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO next_revision
    FROM public.knowledge_revisions WHERE knowledge_id = p_knowledge_id;
  INSERT INTO public.knowledge_revisions (
    organization_id, knowledge_id, revision_number, title, content, category,
    is_active, change_type, change_reason, changed_by
  ) VALUES (
    p_organization_id, p_knowledge_id, next_revision, current_row.title, current_row.content,
    COALESCE(current_row.category, 'general'), COALESCE(current_row.is_active, TRUE),
    p_change_type, NULLIF(trim(p_change_reason), ''), auth.uid()
  );
  UPDATE public.knowledge_base SET title = p_title, content = p_content, category = p_category, updated_at = now()
   WHERE id = p_knowledge_id AND organization_id = p_organization_id;
  RETURN p_knowledge_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.update_knowledge_with_revision(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  p_organization_id UUID, p_query TEXT, p_category TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 8
) RETURNS TABLE (id UUID, title VARCHAR(255), category TEXT, content TEXT, score REAL)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT kb.id, kb.title, COALESCE(kb.category, 'general')::TEXT, kb.content,
    ts_rank_cd(kb.search_vector, plainto_tsquery('simple'::regconfig, trim(p_query))) AS score
  FROM public.knowledge_base kb
  WHERE kb.organization_id = p_organization_id AND kb.is_active = TRUE
    AND (p_category IS NULL OR kb.category = p_category)
    AND kb.search_vector @@ plainto_tsquery('simple'::regconfig, trim(p_query))
  ORDER BY score DESC, kb.updated_at DESC, kb.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge_base(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
