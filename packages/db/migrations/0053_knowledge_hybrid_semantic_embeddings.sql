-- Hybrid semantic + lexical retrieval using native JSONB vectors.
-- This deliberately avoids assuming pgvector is installed on the managed PostgreSQL host.
CREATE OR REPLACE FUNCTION public.normalize_arabic_knowledge_text(input_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(input_text, '')), 'أإآٱى', 'ااااي'),
      '[ًٌٍَُِّْٰـ]', '', 'g'
    ),
    '[[:space:][:punct:]،؛؟]+', ' ', 'g'
  ));
$$;

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS content_embedding JSONB,
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(80);

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS content_embedding JSONB,
  ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(80);

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS original_file BYTEA;

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS search_vector_ar TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, public.normalize_arabic_knowledge_text(coalesce(title, '') || ' ' || coalesce(content, '')))
  ) STORED;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_vector_ar TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, public.normalize_arabic_knowledge_text(coalesce(content, '')))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_embedded
  ON public.knowledge_base (organization_id, is_active, updated_at DESC)
  WHERE content_embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org_embedded
  ON public.knowledge_chunks (organization_id, document_id, chunk_index)
  WHERE content_embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_search_vector_ar
  ON public.knowledge_base USING GIN (search_vector_ar);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector_ar
  ON public.knowledge_chunks USING GIN (search_vector_ar);

CREATE OR REPLACE FUNCTION public.knowledge_cosine_similarity(left_vector JSONB, right_vector JSONB)
RETURNS REAL
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN left_vector IS NULL OR right_vector IS NULL
      OR jsonb_typeof(left_vector) <> 'array'
      OR jsonb_typeof(right_vector) <> 'array'
      OR jsonb_array_length(left_vector) <> 768
      OR jsonb_array_length(right_vector) <> 768
      OR sum((a.value::DOUBLE PRECISION) * (a.value::DOUBLE PRECISION)) = 0
      OR sum((b.value::DOUBLE PRECISION) * (b.value::DOUBLE PRECISION)) = 0
    THEN NULL
    ELSE (
      sum((a.value::DOUBLE PRECISION) * (b.value::DOUBLE PRECISION)) /
      sqrt(
        sum((a.value::DOUBLE PRECISION) * (a.value::DOUBLE PRECISION)) *
        sum((b.value::DOUBLE PRECISION) * (b.value::DOUBLE PRECISION))
      )
    )::REAL
  END
  FROM jsonb_array_elements_text(left_vector) WITH ORDINALITY AS a(value, position)
  JOIN jsonb_array_elements_text(right_vector) WITH ORDINALITY AS b(value, position)
    USING (position);
$$;

-- Keep the original six-argument RPC unavailable so callers cannot accidentally select it
-- instead of the new version that persists the uploaded source bytes.
DROP FUNCTION IF EXISTS public.ingest_knowledge_document(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE FUNCTION public.ingest_knowledge_document(
  p_organization_id UUID,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_content_hash TEXT,
  p_original_text TEXT,
  p_original_file_base64 TEXT,
  p_chunks JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE doc_id UUID;
BEGIN
  INSERT INTO public.knowledge_documents (
    organization_id, file_name, mime_type, content_hash, original_text,
    original_file, status, created_by
  ) VALUES (
    p_organization_id, left(p_file_name, 255), p_mime_type, p_content_hash,
    p_original_text, decode(p_original_file_base64, 'base64'), 'completed', auth.uid()
  )
  ON CONFLICT (organization_id, content_hash) DO NOTHING
  RETURNING id INTO doc_id;

  IF doc_id IS NULL THEN
    SELECT id INTO doc_id FROM public.knowledge_documents
    WHERE organization_id = p_organization_id AND content_hash = p_content_hash;
    RETURN doc_id;
  END IF;

  INSERT INTO public.knowledge_chunks (
    organization_id, document_id, chunk_index, content, content_hash,
    content_embedding, embedding_model
  )
  SELECT p_organization_id, doc_id, item.chunk_index, item.content, item.content_hash,
    item.content_embedding, item.embedding_model
  FROM jsonb_to_recordset(COALESCE(p_chunks, '[]'::jsonb))
    AS item(chunk_index INTEGER, content TEXT, content_hash TEXT, content_embedding JSONB, embedding_model TEXT)
  WHERE length(trim(item.content)) > 0
  ORDER BY item.chunk_index;

  RETURN doc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_knowledge_document(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

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
        OR (p_query_embedding IS NOT NULL AND kb.content_embedding IS NOT NULL)
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
        OR (p_query_embedding IS NOT NULL AND kc.content_embedding IS NOT NULL)
      )
  )
  SELECT result.id, result.title, result.category, result.content, result.score
  FROM (
    SELECT * FROM fact_matches WHERE score > 0.02
    UNION ALL
    SELECT * FROM chunk_matches WHERE score > 0.02
  ) AS result
  ORDER BY result.score DESC, result.title
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge_hybrid(UUID, TEXT, JSONB, TEXT, INTEGER)
  TO authenticated, service_role;
