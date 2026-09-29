-- One open conversation per (organization, contact, channel) — human handoff is durable.
--
-- Root cause addressed here:
--   0005 created `ux_conversation_active` on (organization_id, contact_id, channel_id)
--   WHERE status='active'. But `active` is only one of the open statuses: a conversation
--   that a human took over is `handed_off`, not `closed`.
--
--   Consequence: once a human took over a conversation, the very next inbound message
--   did not find an `active` conversation, so the runtime created a *new* one with
--   ai_enabled = true. The handoff was silently undone and the AI resumed answering a
--   customer who was supposed to be talking to a person. That violates both
--   "AI must not reply while a human controls the conversation" and
--   "AI resumes only explicitly".
--
--   The invariant the schema actually needs is "at most one conversation that is not
--   closed", so this migration replaces the narrow index with the correct one and
--   repairs any rows the old rule already allowed.

-- 1. Collapse existing duplicates, preserving human control -------------------------
-- A handed-off conversation outranks a plain active one, because losing it would hand
-- the customer back to the AI. Everything else falls back to the most recent activity.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id, contact_id, channel_id
           ORDER BY (status = 'handed_off') DESC,
                    COALESCE(last_message_at, created_at) DESC,
                    created_at DESC,
                    id
         ) AS rn
  FROM conversations
  WHERE status <> 'closed'
)
UPDATE conversations c
SET status = 'closed', updated_at = NOW()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 2. Enforce it at the database level ---------------------------------------------
DROP INDEX IF EXISTS ux_conversation_active;

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversation_open
  ON conversations(organization_id, contact_id, channel_id)
  WHERE status <> 'closed';

-- The runtime and the Inbox list both filter open conversations by tenant.
CREATE INDEX IF NOT EXISTS idx_conversations_open
  ON conversations(organization_id, status, updated_at DESC)
  WHERE status <> 'closed';
