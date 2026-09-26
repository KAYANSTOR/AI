-- Practical contact fields for CRM UX (phone/email on contact row)
-- Identities still used for channel linking (WA/IG/Phone external IDs)

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Backfill full_name from first/last when present
UPDATE contacts
SET full_name = TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
WHERE full_name IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_contacts_org_phone ON contacts(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON contacts(organization_id, email);
