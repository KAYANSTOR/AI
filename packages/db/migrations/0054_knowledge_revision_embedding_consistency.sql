-- Keep manual edits and restores consistent with the cumulative revision ledger and embedding index.
DROP FUNCTION IF EXISTS public.update_knowledge_with_revision(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.update_knowledge_with_revision(
  p_organization_id UUID,
  p_knowledge_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_category TEXT,
  p_content_hash TEXT,
  p_content_embedding JSONB,
  p_embedding_model TEXT,
  p_change_reason TEXT,
  p_change_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE current_row public.knowledge_base%ROWTYPE; next_revision INTEGER;
BEGIN
  IF p_change_type NOT IN ('update', 'restore', 'archive', 'activate') THEN
    RAISE EXCEPTION 'Invalid knowledge change type';
  END IF;
  SELECT * INTO current_row FROM public.knowledge_base
   WHERE id = p_knowledge_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge entry not found'; END IF;
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO next_revision
    FROM public.knowledge_revisions WHERE knowledge_id = p_knowledge_id;
  INSERT INTO public.knowledge_revisions (
    organization_id, knowledge_id, revision_number, title, content, category,
    is_active, change_type, change_reason, changed_by
  ) VALUES (
    p_organization_id, p_knowledge_id, next_revision, current_row.title,
    current_row.content, COALESCE(current_row.category, 'general'),
    COALESCE(current_row.is_active, TRUE), p_change_type,
    NULLIF(trim(p_change_reason), ''), auth.uid()
  );
  UPDATE public.knowledge_base
  SET title = p_title, content = p_content, category = p_category,
      content_hash = p_content_hash, content_embedding = p_content_embedding,
      embedding_model = p_embedding_model, updated_at = now()
  WHERE id = p_knowledge_id AND organization_id = p_organization_id;
  RETURN p_knowledge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_knowledge_with_revision(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT
) TO authenticated, service_role;
