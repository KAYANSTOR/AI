-- Archive/activate knowledge through the same immutable revision history.
CREATE OR REPLACE FUNCTION public.set_knowledge_active_with_revision(
  p_organization_id UUID,
  p_knowledge_id UUID,
  p_is_active BOOLEAN,
  p_change_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE current_row public.knowledge_base%ROWTYPE; next_revision INTEGER;
BEGIN
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
    COALESCE(current_row.is_active, TRUE),
    CASE WHEN p_is_active THEN 'activate' ELSE 'archive' END,
    NULLIF(trim(p_change_reason), ''), auth.uid()
  );
  UPDATE public.knowledge_base SET is_active = p_is_active, updated_at = now()
   WHERE id = p_knowledge_id AND organization_id = p_organization_id;
  RETURN p_knowledge_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_knowledge_active_with_revision(UUID, UUID, BOOLEAN, TEXT)
  TO authenticated, service_role;
