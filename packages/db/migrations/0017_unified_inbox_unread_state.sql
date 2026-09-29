-- Add unread state tracking to support Unified Inbox requirements

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

-- Function to handle unread counts automatically
CREATE OR REPLACE FUNCTION public.handle_message_read_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.direction = 'inbound' AND NEW.is_read = FALSE THEN
      UPDATE conversations 
      SET unread_count = unread_count + 1,
          updated_at = NOW()
      WHERE id = NEW.conversation_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_read = FALSE AND NEW.is_read = TRUE AND NEW.direction = 'inbound' THEN
      UPDATE conversations 
      SET unread_count = GREATEST(0, unread_count - 1),
          updated_at = NOW()
      WHERE id = NEW.conversation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_message_read_state ON messages;
CREATE TRIGGER trigger_message_read_state
  AFTER INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_read_state();

-- Ensure all existing outbound messages are marked as read
UPDATE messages SET is_read = TRUE WHERE direction = 'outbound' AND is_read = FALSE;
