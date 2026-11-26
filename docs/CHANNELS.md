# Channel Specification

## WhatsApp
Meta verification/signature → exact phone_number_id → Agent Runtime → Meta send.

## Instagram
Meta verification/signature → exact account ID → Agent Runtime → Meta send.

## الإصدار المركّز

يقتصر نطاق المنتج على قنوات المراسلة المدعومة: واتساب، إنستغرام، Messenger وتيليجرام بحسب إتاحة التكامل والتحقق من الربط. لا يُعد وجود موصل قديم في الكود أو سجل سابق في قاعدة البيانات دليلاً على إتاحته في المنتج.

## Universal
Verify → deduplicate → exact tenant → identity → conversation → persist → eligibility → agent → outbound → audit/usage.
Never create or select an arbitrary tenant from webhook input.


## Meta WhatsApp Embedded Signup (v5)

- The customer-facing connect action loads the Facebook JavaScript SDK only on the channel-connect screen.
- Launch with the Facebook Login for Business Configuration ID and `extras: { version: 'v5' }`. Do not send the v4 `featureType` or `sessionInfoVersion` fields in a v5 launch.
- Read the `WA_EMBEDDED_SIGNUP` completion event from a trusted HTTPS `facebook.com` origin. v5 may return `messaging_account_ids`, `is_on_biz_app`, and `primary_waac_ids`; continue accepting the legacy `waba_id` field for existing callback sessions.
- The browser sends only the short-lived authorization code and non-secret Meta asset IDs to the server action. The server exchanges the code with the app secret, validates the selected phone/WABA association, subscribes the app to the WABA, and stores the access token using CredentialService AES-256-GCM encryption.
- Required server variables: `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID`, `META_APP_SECRET`, `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, and the public Railway URL used by the signed callback-state helper.
- The Meta app's Facebook Login for Business configuration, allowed JavaScript SDK domain, HTTPS OAuth redirect URI, requested permissions, App Review, and Tech Provider access verification remain Meta Dashboard requirements. They cannot be provisioned from application code.
- Embedded Signup completion does not itself mean the channel can send. The channel remains inactive/pending until the phone registration or Coexistence-specific activation requirements reported by Meta are completed.
