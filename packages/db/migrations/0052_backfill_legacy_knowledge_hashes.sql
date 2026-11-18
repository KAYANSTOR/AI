-- Backfill stable hashes for pre-existing facts without dropping or merging rows.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH normalized AS (
  SELECT id, organization_id, created_at,
    regexp_replace(
      regexp_replace(
        translate(lower(content), 'أإآٱى', 'ااااي'),
        '[\u064B-\u065F\u0670\u0640]', '', 'g'
      ),
      '[[:space:][:punct:]،؛؟]+', ' ', 'g'
    ) AS normalized_content
  FROM public.knowledge_base
  WHERE content_hash IS NULL
),
ranked AS (
  SELECT id, organization_id, created_at, normalized_content,
    encode(digest(convert_to(normalized_content, 'UTF8'), 'sha256'), 'hex') AS calculated_hash,
    row_number() OVER (
      PARTITION BY organization_id, normalized_content
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM normalized
)
UPDATE public.knowledge_base kb
SET content_hash = ranked.calculated_hash
FROM ranked
WHERE kb.id = ranked.id
  AND ranked.duplicate_rank = 1
  AND kb.content_hash IS NULL;

-- Existing duplicates remain intact with a NULL hash; they are never deleted or merged.
