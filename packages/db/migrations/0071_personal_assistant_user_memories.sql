-- Private per-user memory for the dashboard-only personal-assistant phase.
-- Deliberately does not create tenant_id, pgvector, WhatsApp, or outbox objects.

CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('fact', 'preference', 'contact', 'project')),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 500),
  content_hash CHAR(64) NOT NULL,
  -- KAYAN stores knowledge embeddings as JSONB; keep this optional so memory
  -- still works when embeddings are disabled or temporarily unavailable.
  content_embedding JSONB,
  embedding_model VARCHAR(80),
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED,
  confidence REAL NOT NULL DEFAULT 0.95 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_memories_org_user_hash_uniq UNIQUE (organization_id, user_id, content_hash),
  CONSTRAINT user_memories_embedding_shape_check CHECK (
    content_embedding IS NULL OR CASE
      WHEN jsonb_typeof(content_embedding) = 'array'
        THEN jsonb_array_length(content_embedding) = 768
      ELSE FALSE
    END
  )
);

CREATE INDEX IF NOT EXISTS user_memories_owner_updated_idx
  ON public.user_memories (organization_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS user_memories_owner_search_idx
  ON public.user_memories USING GIN (content_tsv);

DROP TRIGGER IF EXISTS user_memories_updated_at ON public.user_memories;
CREATE TRIGGER user_memories_updated_at
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_memories_select ON public.user_memories;
CREATE POLICY user_memories_select ON public.user_memories
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS user_memories_insert ON public.user_memories;
CREATE POLICY user_memories_insert ON public.user_memories
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS user_memories_update ON public.user_memories;
CREATE POLICY user_memories_update ON public.user_memories
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS user_memories_delete ON public.user_memories;
CREATE POLICY user_memories_delete ON public.user_memories
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memories TO authenticated, service_role;
