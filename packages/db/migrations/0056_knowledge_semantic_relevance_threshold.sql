-- Reject weak semantic-only matches. Lexical matches remain eligible at their normal rank.
CREATE OR REPLACE FUNCTION public.search_knowledge_hybrid(
  p_organization_id UUID,
  p_query TEXT,
  p_query_embedding JSONB DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(255),
  category TEXT,
  content TEXT,
  score REAL
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH query AS (
    SELECT plainto_tsquery(
      'simple'::regconfig,
      public.normalize_arabic_knowledge_text(trim(p_query))
    ) AS terms
  ),
  fact_matches AS (
    SELECT kb.id, kb.title, COALESCE(kb.category, 'general')::TEXT AS category,
      kb.content,
      CASE
        WHEN p_query_embedding IS NULL THEN ts_rank_cd(kb.search_vector_ar, query.terms)
        ELSE (
          0.72 * greatest(0, coalesce(public.knowledge_cosine_similarity(kb.content_embedding, p_query_embedding), 0)) +
          0.28 * least(1, ts_rank_cd(kb.search_vector_ar, query.terms) * 4)
        )
      END::REAL AS score
    FROM public.knowledge_base kb
    CROSS JOIN query
    WHERE kb.organization_id = p_organization_id
      AND kb.is_active = TRUE
      AND (p_category IS NULL OR kb.category = p_category)
      AND (
        kb.search_vector_ar @@ query.terms
        OR (
          p_query_embedding IS NOT NULL
          AND kb.content_embedding IS NOT NULL
          AND public.knowledge_cosine_similarity(kb.content_embedding, p_query_embedding) >= 0.38
        )
      )
  ),
  chunk_matches AS (
    SELECT kc.id, kd.file_name::VARCHAR(255) AS title,
      'general'::TEXT AS category, kc.content,
      CASE
        WHEN p_query_embedding IS NULL THEN ts_rank_cd(kc.search_vector_ar, query.terms)
        ELSE (
          0.72 * greatest(0, coalesce(public.knowledge_cosine_similarity(kc.content_embedding, p_query_embedding), 0)) +
          0.28 * least(1, ts_rank_cd(kc.search_vector_ar, query.terms) * 4)
        )
      END::REAL AS score
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_documents kd
      ON kd.id = kc.document_id AND kd.organization_id = kc.organization_id
    CROSS JOIN query
    WHERE kc.organization_id = p_organization_id
      AND kd.status = 'completed'
      AND p_category IS NULL
      AND (
        kc.search_vector_ar @@ query.terms
        OR (
          p_query_embedding IS NOT NULL
          AND kc.content_embedding IS NOT NULL
          AND public.knowledge_cosine_similarity(kc.content_embedding, p_query_embedding) >= 0.38
        )
      )
  )
  SELECT result.id, result.title, result.category, result.content, result.score
  FROM (
    SELECT * FROM fact_matches
    UNION ALL
    SELECT * FROM chunk_matches
  ) AS result
  ORDER BY result.score DESC, result.title
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge_hybrid(UUID, TEXT, JSONB, TEXT, INTEGER)
  TO authenticated, service_role;
