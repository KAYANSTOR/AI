-- Preserve an explicit, tenant-scoped origin label for every curated knowledge fact.
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'legacy';
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_base_source_type_check'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
      ADD CONSTRAINT knowledge_base_source_type_check
      CHECK (source_type IN ('legacy', 'manual', 'training', 'import'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_base_org_source_created
  ON public.knowledge_base (organization_id, source_type, created_at DESC);
