-- A WABA lookup or successful Embedded Signup does not prove that the
-- selected phone number is registered for WhatsApp Cloud API messaging.
-- Previously, channels were marked verified immediately after OAuth signup.
-- Require the explicit /{PHONE_NUMBER_ID}/register step before routing sends.

UPDATE public.channels
   SET verification_status = 'pending',
       is_active = FALSE,
       updated_at = NOW()
 WHERE channel_type = 'whatsapp'
   AND provider_account_id IS NOT NULL
   AND is_active = TRUE
   AND verification_status = 'verified';
