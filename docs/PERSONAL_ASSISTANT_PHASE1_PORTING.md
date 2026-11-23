# تكييف حزمة المساعد الشخصي — المرحلة الأولى

## نطاق هذه الدفعة

هذه الدفعة تدمج إدارة الذاكرة الشخصية في لوحة KAYAN فقط. البيانات مقيدة بالمؤسسة والمستخدم معاً؛ سياسة RLS لا تسمح لعضو آخر في المؤسسة بقراءة ذاكرة المستخدم. تستخدم التضمينات الاختيارية بصيغة JSONB وبنفس نموذج وأبعاد المعرفة الحالية في KAYAN، ويظل الحفظ متاحاً إذا كانت التضمينات معطلة.

لا تتصل هذه الشريحة برسائل العملاء أو WhatsApp، ولا تغيّر محركات القطاعات الأربعة، ولا تشغّل SQL مباشرة على قاعدة الإنتاج. الترحيل مرقم بعد آخر إصدار مؤكد (0070) ليعمل حصراً من خلال `npm run db:migrate` عند اعتماد نشر لاحق.

## خريطة إعادة التسمية والتكييف

| مصدر الحزمة | موضع KAYAN / القرار |
| --- | --- |
| `migrations/0001_personal_assistant_phase1.sql` | تكييف الجزء الخاص بالذاكرة فقط في `packages/db/migrations/0071_personal_assistant_user_memories.sql`؛ استبدال `tenant_id` بـ`organization_id` وإضافة `user_id` وRLS الخاص بالمالك. تم حذف افتراض `tenants` و`pgvector` وجداول WhatsApp وOutbox من هذه الشريحة. |
| `personal_assistant/memory-normalize.ts` | `apps/web/src/lib/personal-assistant/memory-normalize.ts`؛ يحتفظ بتطبيع العربية وبصمة SHA-256. |
| `personal_assistant/api-memories.ts` | أُعيدت كتابته في `apps/web/src/app/api/assistant/memories/route.ts` باستخدام `getCurrentOrg()` وعميل KAYAN ذي هوية المستخدم وسياسات RLS. كل قراءة وكتابة تقيد `organization_id` و`user_id`. |
| `personal_assistant/MemoryPanel.tsx` | أُعيدت كتابته في `apps/web/src/components/dashboard/personal-assistant-memory-panel.tsx` وفق مكونات وألوان KAYAN، مع إدخال وتعديل وحذف صريح. |
| ملف واجهة صفحة الذاكرة | جديد: `apps/web/src/app/dashboard/assistant/memories/page.tsx`. |
| `personal_assistant/integration-map.ts` | أصبح هذا المستند؛ يسجل قرارات التكييف وما لم يُدمج بعد. |

## مؤجل عمداً

- `turn-handler.ts` و`tools.ts` و`registry-entry.ts`: تتطلب واجهة محادثة مخصصة وربطاً آمناً بجلسة مالك؛ لا تُوصل بمعالج الرسائل الواردة للعملاء ولا تضيف `assistant_engine` خامساً.
- `personal_tasks` و`cron-handler.ts` و`claim_due_reminders.sql`: تتطلبان تعريفاً متفقاً عليه لتذكيرات المالك. لا يُستخدم Outbox WhatsApp الخاص برسائل العملاء لهذا الغرض.
- `pending_approvals` و`trust-gate.ts`: لا تُنشأ أدوات عالية المخاطر في هذه الشريحة؛ عند تنفيذها يجب أن يكون حجز الموافقة والتنفيذ ذرياً وبنطاق مستخدم ومؤسسة.
- `connected_integrations` و`0002_assistant_settings.sql`: مؤجلة؛ لا نخزن رموز OAuth قبل اعتماد تصميم تشفير وملكية وإبطال.
- استخراج الذاكرة الآلي من محادثة لم يُفعّل؛ لا توجد مهمة خلفية متينة في هذه الدفعة، ولا يُستخدم fire-and-forget.

## التحقق

- يجب تشغيل `npm run typecheck --workspace=apps/web` و`npm run lint --workspace=apps/web` وفحوص الاختبارات المناسبة محلياً.
- لم يُنفّذ ترحيل SQL على قاعدة التطوير أو الإنتاج في هذه الدفعة.
- لا يتم الدفع إلى `branch1` حتى الحصول على موافقة صريحة تخص التغييرات الجديدة، لأن الدفع قد يفعّل نشر Railway.
