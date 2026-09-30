-- UX FastPath — the business's own description, collected once during onboarding.
--
-- Stage "جهّز الوكيل" asks the owner to describe the business in ordinary language. That
-- text is configuration the owner can come back and edit, so it is stored as-is; the
-- controlled draft (identity, reply style, hand-off) is derived from it and published as
-- the agent prompt.
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS public_phone_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS setup_description TEXT;
