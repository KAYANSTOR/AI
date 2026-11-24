-- Who produced a message. Owner replies typed manually in the WhatsApp phone
-- app (fromMe on the linked device) are stored as outbound/human_whatsapp so
-- they appear in the same inbox conversation without triggering the AI.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'messages_sender_type_check'
       AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_sender_type_check
      CHECK (sender_type IS NULL OR sender_type IN ('contact', 'ai', 'human_dashboard', 'human_whatsapp', 'system'));
  END IF;
END $$;

-- Newest-first conversation history with keyset pagination ("load older").
CREATE INDEX IF NOT EXISTS idx_messages_conversation_recent
  ON public.messages (conversation_id, created_at DESC, id DESC);

-- Inbox search runs in the database instead of over the latest 100 rows.
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_message
  ON public.conversations (organization_id, last_message_at DESC NULLS LAST, id DESC);
