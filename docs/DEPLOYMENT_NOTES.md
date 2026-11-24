# ملاحظات GitHub وRailway

المستودع المستخدم في هذه الدفعة هو https://github.com/KAYANSTOR/AI. بعد فحص الفروع، تبين أن خدمة Railway `kayan-ai` تستخدم فرع `branch1` وليس `main`.

بيانات Railway التي ظهرت أثناء التدقيق: Project ID `1ee7886b-d9d1-4539-ab46-0b4f50c28f08`، Production environment ID `9a83c98e-4d32-4245-938a-8e3ee01a97d9`، Service ID `091f81ae-8335-4ed6-939f-f621ad2b5171`. قاعدة البيانات هي `Postgres`.

الفرع `branch1` كان عند commit `cf34aba` قبل هذه الدفعة، ويحتوي على Migration `0071_personal_assistant_user_memories.sql` ومسار الذاكرة الشخصية. هذه الدفعة تضيف Migration `0072_personal_assistant_tasks.sql` وتُدفع إلى `branch1` حتى لا تُنشر تغييرات المساعد في فرع غير مرتبط بالخدمة.

لا تُشغّل SQL يدوياً على الإنتاج. تطبيق Migration `0072` يجب أن يتم عبر `preDeployCommand` المعتاد في `railway.json` أثناء نشر commit الفرع المرتبط.
