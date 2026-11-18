-- Restrict knowledge RPC and helper execution to authenticated tenant members and server role.
REVOKE ALL ON FUNCTION public.normalize_arabic_knowledge_text(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_arabic_knowledge_text(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.knowledge_cosine_similarity(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_cosine_similarity(JSONB, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_knowledge_base(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge_base(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_knowledge_hybrid(UUID, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge_hybrid(UUID, TEXT, JSONB, TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ingest_knowledge_document(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_knowledge_document(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_knowledge_with_revision(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_knowledge_with_revision(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_knowledge_active_with_revision(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_knowledge_active_with_revision(UUID, UUID, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_knowledge_chunk_embedding(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_knowledge_chunk_embedding(UUID, UUID, JSONB, TEXT) TO authenticated, service_role;
