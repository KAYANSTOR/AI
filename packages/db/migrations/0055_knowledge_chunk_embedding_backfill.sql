-- Allow tenant administrators to backfill embeddings for chunks created before semantic indexing.
DROP POLICY IF EXISTS knowledge_chunks_update ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_update ON public.knowledge_chunks
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

GRANT UPDATE ON public.knowledge_chunks TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_knowledge_chunk_embedding(
  p_organization_id UUID,
  p_chunk_id UUID,
  p_content_embedding JSONB,
  p_embedding_model TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE updated_id UUID;
BEGIN
  IF p_content_embedding IS NULL OR jsonb_typeof(p_content_embedding) <> 'array'
     OR jsonb_array_length(p_content_embedding) <> 768 THEN
    RAISE EXCEPTION 'Invalid knowledge embedding dimensions';
  END IF;

  UPDATE public.knowledge_chunks
  SET content_embedding = p_content_embedding,
      embedding_model = p_embedding_model
  WHERE id = p_chunk_id
    AND organization_id = p_organization_id
    AND content_embedding IS NULL
  RETURNING id INTO updated_id;

  RETURN updated_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_knowledge_chunk_embedding(UUID, UUID, JSONB, TEXT)
  TO authenticated, service_role;
