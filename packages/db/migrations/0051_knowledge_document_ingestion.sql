-- Tenant-isolated plain-text document ingestion with atomic chunk persistence.
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  original_text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('processing','completed','failed')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org_created
  ON public.knowledge_documents (organization_id, created_at DESC);
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_documents_select ON public.knowledge_documents;
CREATE POLICY knowledge_documents_select ON public.knowledge_documents
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS knowledge_documents_insert ON public.knowledge_documents;
CREATE POLICY knowledge_documents_insert ON public.knowledge_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
GRANT SELECT, INSERT ON public.knowledge_documents TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, coalesce(content, ''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org_document
  ON public.knowledge_chunks (organization_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector
  ON public.knowledge_chunks USING GIN (search_vector);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_chunks_select ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_select ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS knowledge_chunks_insert ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_insert ON public.knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
GRANT SELECT, INSERT ON public.knowledge_chunks TO authenticated, service_role;

-- One transaction stores the source and all chunks. A failure cannot leave a partial document.
CREATE OR REPLACE FUNCTION public.ingest_knowledge_document(
  p_organization_id UUID,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_content_hash TEXT,
  p_original_text TEXT,
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
    organization_id, file_name, mime_type, content_hash, original_text, status, created_by
  ) VALUES (
    p_organization_id, left(p_file_name, 255), p_mime_type, p_content_hash,
    p_original_text, 'completed', auth.uid()
  )
  ON CONFLICT (organization_id, content_hash) DO NOTHING
  RETURNING id INTO doc_id;

  IF doc_id IS NULL THEN
    SELECT id INTO doc_id FROM public.knowledge_documents
    WHERE organization_id = p_organization_id AND content_hash = p_content_hash;
    RETURN doc_id;
  END IF;

  INSERT INTO public.knowledge_chunks (
    organization_id, document_id, chunk_index, content, content_hash
  )
  SELECT p_organization_id, doc_id, item.chunk_index, item.content, item.content_hash
  FROM jsonb_to_recordset(COALESCE(p_chunks, '[]'::jsonb))
    AS item(chunk_index INTEGER, content TEXT, content_hash TEXT)
  WHERE length(trim(item.content)) > 0
  ORDER BY item.chunk_index;

  RETURN doc_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ingest_knowledge_document(UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

-- Combine curated facts and document chunks in one indexed, tenant-scoped retrieval path.
CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  p_organization_id UUID, p_query TEXT, p_category TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (id UUID, title VARCHAR(255), category TEXT, content TEXT, score REAL)
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT result.id, result.title, result.category, result.content, result.score
  FROM (
    SELECT kb.id, kb.title, COALESCE(kb.category, 'general')::TEXT AS category, kb.content,
      ts_rank_cd(kb.search_vector, plainto_tsquery('simple'::regconfig, trim(p_query))) AS score,
      kb.updated_at AS sort_at
    FROM public.knowledge_base kb
    WHERE kb.organization_id = p_organization_id AND kb.is_active = TRUE
      AND (p_category IS NULL OR kb.category = p_category)
      AND kb.search_vector @@ plainto_tsquery('simple'::regconfig, trim(p_query))
    UNION ALL
    SELECT kc.id, kd.file_name::VARCHAR(255), 'general'::TEXT, kc.content,
      ts_rank_cd(kc.search_vector, plainto_tsquery('simple'::regconfig, trim(p_query))) AS score,
      kd.created_at AS sort_at
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_documents kd
      ON kd.id = kc.document_id AND kd.organization_id = kc.organization_id
    WHERE kc.organization_id = p_organization_id AND kd.status = 'completed'
      AND p_category IS NULL
      AND kc.search_vector @@ plainto_tsquery('simple'::regconfig, trim(p_query))
  ) AS result
  ORDER BY result.score DESC, result.sort_at DESC, result.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50));
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge_base(UUID, TEXT, TEXT, INTEGER)
  TO authenticated, service_role;
