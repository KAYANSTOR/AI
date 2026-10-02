# Channel Specification

## Phone
Existing business number → carrier forwarding → Vapi → authenticated webhook/runtime.

## WhatsApp
Meta verification/signature → exact phone_number_id → Agent Runtime → Meta send.

## Instagram
Meta verification/signature → exact account ID → Agent Runtime → Meta send.

## الإصدار المركّز

WhatsApp هو قناة الرسائل الوحيدة الظاهرة للمستخدم في الإصدار الأول. الهاتف اختياري ومؤجل إلى ما بعد استقرار مسار WhatsApp. Instagram وSMS غير ظاهرين في تجربة العميل، ويمكن إبقاء موصلاتهما الخلفية مؤقتًا للتوافق دون اعتبارهما جزءًا من المنتج.

## Universal
Verify → deduplicate → exact tenant → identity → conversation → persist → eligibility → agent → outbound → audit/usage.
Never create or select an arbitrary tenant from webhook input.
