# Channel Specification

## Phone
Existing business number → carrier forwarding → Vapi → authenticated webhook/runtime.

## SMS
Twilio cloud number → X-Twilio-Signature → exact To-number Channel → Agent Runtime → Twilio reply.
SMS is independent from call forwarding.

## WhatsApp
Meta verification/signature → exact phone_number_id → Agent Runtime → Meta send.

## Instagram
Meta verification/signature → exact account ID → Agent Runtime → Meta send.

## Universal
Verify → deduplicate → exact tenant → identity → conversation → persist → eligibility → agent → outbound → audit/usage.
Never create or select an arbitrary tenant from webhook input.
