# النشر على Railway

## الخدمات

| الخدمة | الوصف |
|---|---|
| `Postgres` | قاعدة بيانات Railway مع وحدة تخزين دائمة |
| `web` | تطبيق Next.js من هذا المستودع |

إعداد البناء والتشغيل في `railway.json`:

- البناء: `npm run build`
- قبل كل نشر: `npm run db:migrate` (يطبق الترحيلات الجديدة فقط، داخل معاملة لكل ترحيل)
- التشغيل: `npm run start` على المنفذ `PORT` الذي يحدده Railway

## متغيرات خدمة الويب

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (الشبكة الخاصة، بدون TLS) |
| `AUTH_SECRET` | سر عشوائي طويل |
| `CREDENTIAL_ENCRYPTION_KEY` | نفس المفتاح المستخدم سابقاً، وإلا تتعذر قراءة بيانات القنوات المحفوظة |
| `NEXT_PUBLIC_SITE_URL` و`NEXT_PUBLIC_APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` أو النطاق الخاص |
| `CRON_SECRET` | 32 حرفاً على الأقل |
| `GEMINI_API_KEY`، `GEMINI_MODEL` | نموذج الذكاء الاصطناعي |
| متغيرات Meta وTwilio وVapi وStripe | حسب القنوات المفعلة (انظر `.env.example`) |

متغيرات `NEXT_PUBLIC_*` تُضمَّن وقت البناء، لذا أعد النشر بعد تغييرها.

## نقل البيانات من قاعدة سابقة

1. أوقف الكتابة على القاعدة القديمة (وضع صيانة أو إيقاف webhooks مؤقتاً).
2. طبّق الترحيلات على القاعدة الجديدة: `npm run db:migrate`.
3. جرّب النقل دون كتابة:

   ```sh
   SOURCE_DATABASE_URL='<old-db-url>' DATABASE_URL='<railway-public-url>' npm run db:import -- --dry-run
   ```

4. نفّذ النقل بإزالة `--dry-run`. يتم كل شيء في معاملة واحدة، ويُنقل الحسابات مع تجزئة كلمات المرور كما هي، ثم يتحقق السكربت من أعداد الصفوف.
5. حدّث روابط webhooks لدى Meta وTwilio وVapi وStripe إلى النطاق الجديد.

## إعادة تعيين كلمة مرور

```sh
DATABASE_URL='<railway-public-url>' npm run db:reset-password -- user@example.com
```

تُقرأ كلمة المرور من الإدخال القياسي، وتُلغى كل الجلسات القائمة للحساب.

## المهام الدورية

راجع [SCHEDULED_WORKERS.md](SCHEDULED_WORKERS.md).
