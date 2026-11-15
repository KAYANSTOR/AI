-- Supports the organization-scoped appointments list ordered by start time.
CREATE INDEX IF NOT EXISTS idx_appointments_org_starts
  ON appointments(organization_id, starts_at);

-- Supports the organization-scoped leads list ordered newest first.
CREATE INDEX IF NOT EXISTS idx_leads_org_created_at_desc
  ON leads(organization_id, created_at DESC);

-- Supports the organization-scoped contacts list ordered newest first.
CREATE INDEX IF NOT EXISTS idx_contacts_org_created_at_desc
  ON contacts(organization_id, created_at DESC);

-- Supports the organization-scoped conversations list ordered by latest message.
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_message_at_desc
  ON conversations(organization_id, last_message_at DESC);
