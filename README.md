# FrontDesk AI — FrontDesk AI
> منصة ويب عربية لإدارة استقبال العملاء والمحادثات والقنوات وتشغيل وكيل ذكاء اصطناعي للشركات، كما يثبت التنفيذ في `apps/web/`.

## 📖 نظرة عامة
- التطبيق الأساسي هو تطبيق Next.js داخل `apps/web/`، وتستخدم واجهته صفحات عامة وصفحات تسجيل الدخول ولوحة تحكم.
- الاسم الظاهر في بيانات الحزم والصفحات هو `FrontDesk AI`؛ اسم الحزمة الجذري `frontdesk-ai` في `package.json`.
- يتضمن المستودع monorepo بتعريف workspaces للمسارات `apps/*` و`packages/*` و`tools/*` في `package.json`.
- المسار التشغيلي الموثق في الكود يبدأ بإنشاء حساب، اختيار نوع النشاط، إعداد البيانات، ربط قناة، ثم تفعيل النشاط من `apps/web/src/app/signup/page.tsx` و`apps/web/src/app/onboarding/`.
- يعتمد التخزين والوصول إلى بيانات التطبيق على Supabase عبر عميل المتصفح والخادم والعميل الإداري في `apps/web/src/lib/supabase/`.
- لا يوجد ملف Demo مستقل أو رابط تجريبي موثق في المستودع.

## 🎯 المشكلة والحل
- المشكلة المعلنة في واجهة الموقع هي تشتت استقبال العملاء بين المحادثات والعملاء والمواعيد والقنوات؛ مصدر النص `apps/web/src/components/site/problem-solution.tsx`.
- الحل المنفذ هو لوحة تشغيل تجمع المحادثات والعملاء والعملاء المحتملين والمواعيد والخدمات وعروض الأسعار والطلبات؛ المسارات `apps/web/src/app/dashboard/` وملفات الـ migrations من `packages/db/migrations/`.
- يعالج الوكيل الرسائل الواردة عبر مسار مشترك ثم يرسل الرد عبر القناة المطابقة؛ `apps/web/src/lib/runtime/process-inbound.ts` و`apps/web/src/lib/runtime/outbound.ts`.
- إذا لم تغط قاعدة المعرفة السؤال، فإن البحث المعجمي يعيد نتائج فارغة بدلاً من اختراع إجابة؛ `apps/web/src/lib/knowledge/retrieval.ts`.
- وصف الجمهور المستهدف التفصيلي غير موثّق في المستودع.

## ✨ الميزات الرئيسية
- ✅ **تسجيل الحساب وإعداد النشاط:** إنشاء حساب الشركة واختيار نوع النشاط ثم متابعة مراحل الإعداد؛ `apps/web/src/app/signup/` و`apps/web/src/app/onboarding/`.
- ✅ **تهيئة وكيل الذكاء الاصطناعي:** تعديل الاسم واللغة ودرجة الإبداع والحالة ونشر نسخ التعليمات واستعادتها؛ `apps/web/src/app/dashboard/agent/` و`apps/web/src/app/dashboard/agent/actions.ts`.
- ✅ **تدريب الوكيل واستخراج المعرفة:** يرسل التدريب إلى Gemini ويحفظ الحقائق والخدمات بعد التحقق؛ `apps/web/src/app/api/agent/train/route.ts` و`apps/web/src/lib/knowledge/layer.ts`.
- ✅ **قاعدة معرفة مع بحث معجمي:** حفظ المعرفة وتفعيلها وتعطيلها وحذفها والبحث فيها ضمن المؤسسة؛ `apps/web/src/lib/knowledge/`.
- ✅ **معاينة الوكيل:** اختبار محادثة لوكيل فعال مع إرجاع الرد وآثار الأدوات المحاكاة؛ `apps/web/src/app/api/agent/test/route.ts`.
- ✅ **WhatsApp عبر Meta:** التحقق من webhook، المطابقة الدقيقة لـ`phone_number_id`، معالجة الرسائل والرد؛ `apps/web/src/app/api/whatsapp/webhook/route.ts`.
- ✅ **Instagram عبر Meta:** التحقق من webhook والمطابقة الدقيقة لمعرّف الحساب ومعالجة الرسائل والرد؛ `apps/web/src/app/api/instagram/webhook/route.ts`.
- ✅ **SMS عبر Twilio:** التحقق من توقيع Twilio، استقبال الرسالة، معالجة الرد وإرساله؛ `apps/web/src/app/api/sms/webhook/route.ts` و`apps/web/src/lib/providers/twilio.ts`.
- ✅ **الهاتف عبر Vapi:** مسار webhook للهاتف وتكامل Vapi وإدارة اتصال الهاتف؛ `apps/web/src/app/api/vapi/webhook/route.ts` و`apps/web/src/app/dashboard/channels/phone-actions.ts`.
- ✅ **صندوق وارد ومحادثات:** عرض المحادثات، تحديث حالتها، التعيين، والتحويل لموظف بشري؛ `apps/web/src/app/dashboard/inbox/` و`apps/web/src/lib/runtime/tools.ts`.
- ✅ **العملاء والعملاء المحتملون والتصدير:** إدارة القوائم وتصدير CSV حتى 5000 سجل؛ `apps/web/src/app/dashboard/contacts/` و`apps/web/src/app/api/export/`.
- ✅ **المواعيد والخدمات:** إدارة الخدمات وفترات الإتاحة والمواعيد؛ `apps/web/src/app/dashboard/appointments/` و`apps/web/src/lib/appointments/`.
- ✅ **المبيعات التشغيلية:** إنشاء عروض الأسعار والطلبات وحساب الإجماليات؛ `apps/web/src/app/dashboard/quotes/` و`apps/web/src/app/dashboard/orders/` و`apps/web/src/lib/sales.ts`.
- ✅ **الأتمتة والتشغيل الدوري:** محرك workflows وحملات ومتابعة وSLA وتذكير المواعيد عبر cron routes؛ `apps/web/src/lib/workflows/` و`apps/web/src/app/api/cron/`.
- ✅ **الفوترة:** إنشاء Stripe Checkout وتحديث حالة الاشتراك بعد التحقق من webhook؛ `apps/web/src/lib/billing/stripe.ts` و`apps/web/src/app/api/billing/stripe-webhook/route.ts`.
- ✅ **أدوار الفريق والإشعارات والإعدادات:** أدوار `owner/admin/manager/member/read_only` وإعدادات الردود الجاهزة ومفاتيح API وسياسات التصعيد؛ `apps/web/src/lib/team.ts` و`apps/web/src/app/dashboard/settings/`.

## 🛠️ التقنيات
| المجال | التقنية | دليلها |
|---|---|---|
| إطار الويب | Next.js 16.3.6 | `apps/web/package.json` و`apps/web/next.config.ts` |
| واجهة المستخدم | React 19.2.8 | `apps/web/package.json` |
| اللغة | TypeScript | `apps/web/package.json` وملفات `.ts`/`.tsx` |
| تنسيق CSS | Tailwind CSS 4 وPostCSS | `apps/web/package.json` و`apps/web/postcss.config.mjs` |
| قاعدة البيانات | PostgreSQL عبر Supabase | `packages/db/drizzle.config.json` و`apps/web/src/lib/supabase/` |
| ORM وأدوات المخطط | Drizzle ORM وDrizzle Kit | `packages/db/package.json` و`packages/db/drizzle.config.json` |
| المصادقة | Supabase Auth SSR | `apps/web/src/lib/supabase/server.ts` و`apps/web/src/lib/supabase/middleware.ts` |
| مزود الذكاء الاصطناعي | Google Gemini عبر AI SDK | `apps/web/package.json` و`apps/web/src/lib/providers/gemini.ts` |
| بث ردود Copilot | Vercel AI SDK | `apps/web/package.json` و`apps/web/src/app/api/copilot/route.ts` |
| تحقق المدخلات | Zod | `apps/web/package.json` و`apps/web/src/app/api/agent/test/route.ts` |
| القنوات | Meta وTwilio وVapi | `apps/web/src/lib/providers/` ومسارات `apps/web/src/app/api/` |
| الدفع | Stripe Checkout وwebhook | `apps/web/src/lib/billing/stripe.ts` |
| الأيقونات | lucide-react | `apps/web/package.json` و`apps/web/next.config.ts` |
| التشغيل الآلي | GitHub Actions وcurl | `.github/workflows/outbox-cron.yml` |
| خادم MCP | `@modelcontextprotocol/sdk` | `tools/mcp-server/package.json` و`tools/mcp-server/index.js` |

## 🏗️ هيكل المشروع
```text
.
├── package.json                         # workspaces وأوامر الجذر
├── .env.example                         # أسماء متغيرات البيئة
├── .github/workflows/outbox-cron.yml    # cron خارجي كل خمس دقائق
├── apps/web/
│   ├── package.json                      # أوامر Next.js والاختبارات
│   ├── next.config.ts                   # standalone وcompress
│   ├── vercel.json                      # مخطط Vercel فقط
│   ├── src/app/                         # App Router والصفحات وAPI routes
│   │   ├── dashboard/                   # لوحة التشغيل
│   │   ├── onboarding/                  # مسار التفعيل
│   │   ├── api/                         # webhooks وcron وAPI
│   │   └── login/ signup/               # المصادقة
│   ├── src/components/                  # مكونات الموقع ولوحة التحكم
│   ├── src/lib/                         # runtime والقنوات والبيانات والحوكمة
│   └── tests/                            # اختبارات Node المضمنة
├── packages/db/
│   ├── migrations/0000..0039_*.sql      # مخطط PostgreSQL وRLS والدوال
│   ├── scripts/migrate.ts               # مشغل migrations
│   └── drizzle.config.json              # إعداد Drizzle PostgreSQL
├── tools/mcp-server/                    # خادم CodeCraft MCP
├── scripts/db/migrate.ts                # مشغل قاعدة البيانات المستعمل في scripts
└── docs/                                # مواصفات وقرارات معمارية وإرشادات cron
```

## 🚀 التشغيل المحلي
### المتطلبات المثبتة في التهيئة
- Node.js بإصدار `>=18.0.0` لخادم MCP؛ `tools/mcp-server/package.json`.
- يعتمد تطبيق الويب على npm scripts في `package.json` و`apps/web/package.json`.
- لا يوجد lockfile (`package-lock.json` أو `yarn.lock` أو `pnpm-lock.yaml`) في المستودع.
- يلزم إعداد Supabase وفق `apps/web/src/lib/supabase/env.ts` قبل مسارات التطبيق التي تتطلبه.

### الأوامر الموجودة فعلياً
```bash
npm run dev
npm run build
npm run start
npm run lint
cd apps/web
npm run dev
npm run dev:prod
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```
- `npm run dev` في الجذر يفوض إلى مساحة `apps/web`.
- `npm run build` و`npm run start` و`npm run lint` في الجذر تفوض إلى مساحة `apps/web`.
- خادم التطوير والإنتاج في `apps/web` يستمعان على المنفذ 3000 والعنوان `0.0.0.0` كما هو معرف في scripts.
- لا يوجد أمر تثبيت موثق في scripts؛ أمر `npm ci` غير قابل للتوثيق لغياب lockfile.

### قاعدة البيانات
```bash
cd packages/db
npm run migrate
npm run migrate:up
npm run migrate:down
npm run drizzle:generate
npm run drizzle:migrate
npm run drizzle:studio
```
- الأوامر أعلاه من `packages/db/package.json`؛ يعتمد المشغل على `DATABASE_URL` في `scripts/db/migrate.ts`.
- توجد 40 migration من `0000_initial.sql` إلى `0039_yemen_carrier_profiles.sql`.
- `packages/db/scripts/supabase-shim.sql` مخصص للتشغيل المحلي/CI وليس migration للبيئة الحقيقية.

## 🔐 متغيرات البيئة
> الأسماء التالية مطابقة حرفياً لـ`.env.example`. لا يحتوي المثال على قيم؛ الغرض يذكر فقط ما يثبته الاستخدام أو التهيئة.
| الاسم | الغرض المثبت | مطلوب/اختياري |
|---|---|---|
| `CODECRAFT_API_KEY` | مفتاح CodeCraft وفق `docs/CODECRAFT_MCP.md` | اختياري لمسار MCP |
| `CODECRAFT_BRANCH` | فرع CodeCraft وفق `docs/CODECRAFT_MCP.md` | اختياري لمسار MCP |
| `CODECRAFT_DEFAULT_MODEL` | نموذج CodeCraft الافتراضي وفق `docs/CODECRAFT_MCP.md` | اختياري لمسار MCP |
| `CODECRAFT_MCP_TOKEN` | غير موثّق في المستودع | اختياري |
| `CODECRAFT_REPO` | مستودع CodeCraft وفق `docs/CODECRAFT_MCP.md` | اختياري لمسار MCP |
| `CRON_SECRET` | Bearer secret للتحقق من طلبات cron؛ `apps/web/src/lib/cron/auth.ts` | مطلوب لمسارات cron |
| `GEMINI_API_KEY` | مفتاح Gemini لمسارات الوكيل وCopilot؛ `apps/web/src/app/api/agent/` | مطلوب لهذه الميزات |
| `GEMINI_MODEL` | اسم نموذج Gemini؛ `apps/web/src/app/api/copilot/route.ts` | اختياري وله fallback في الكود |
| `GITHUB_TOKEN` | غير موثّق في المستودع | اختياري |
| `INSTAGRAM_ACCESS_TOKEN` | رمز وصول Instagram في محلل credentials؛ `apps/web/src/lib/credentials/resolve.ts` | مطلوب عند تفعيل Instagram |
| `INSTAGRAM_VERIFY_TOKEN` | رمز تحقق Instagram webhook؛ `apps/web/src/app/api/instagram/webhook/route.ts` | مطلوب للتحقق |
| `META_APP_SECRET` | توقيع Meta webhook؛ `apps/web/src/lib/runtime/security.ts` | مطلوب للـwebhooks |
| `META_GRAPH_BASE_URL` | عنوان Meta Graph في إعدادات credentials؛ `apps/web/src/lib/credentials/resolve.ts` | اختياري |
| `NEXT_PUBLIC_APP_URL` | عنوان التطبيق المستخدم في الفوترة؛ `apps/web/src/app/dashboard/billing/actions.ts` | اختياري وله fallback |
| `NEXT_PUBLIC_META_APP_ID` | معرّف Meta العام في embedded signup؛ `apps/web/src/lib/channels/embedded-signup.ts` | مطلوب لمسار embedded signup |
| `NEXT_PUBLIC_META_EMBEDDED_CONFIG_ID` | معرّف إعداد Meta embedded signup؛ `apps/web/src/lib/channels/embedded-signup.ts` | مطلوب لمسار embedded signup |
| `NEXT_PUBLIC_SITE_URL` | أصل الموقع لإعادة توجيه المصادقة؛ `apps/web/src/lib/auth/redirect-url.ts` | اختياري وله بدائل |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح Supabase العام؛ `apps/web/src/lib/supabase/env.ts` | مطلوب لتكوين Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` | عنوان مشروع Supabase؛ `apps/web/src/lib/supabase/env.ts` | مطلوب لتكوين Supabase |
| `STRIPE_PRICE_ID` | معرّف السعر لجلسة Checkout؛ `apps/web/src/lib/billing/stripe.ts` | مطلوب للفوترة عند عدم تمرير سعر |
| `STRIPE_SECRET_KEY` | مفتاح Stripe السري لجلسة Checkout؛ `apps/web/src/lib/billing/stripe.ts` | مطلوب للفوترة |
| `STRIPE_WEBHOOK_SECRET` | سر توقيع Stripe webhook؛ `apps/web/src/app/api/billing/stripe-webhook/route.ts` | مطلوب لـStripe webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service role للعميل الإداري؛ `apps/web/src/lib/supabase/admin.ts` | مطلوب لمسارات server/admin |
| `VAPI_API_KEY` | مفتاح Vapi لإدارة اتصال الهاتف؛ `apps/web/src/app/dashboard/channels/phone-actions.ts` | مطلوب عند إدارة الهاتف |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | غير موثّق في المستودع | اختياري |
| `VAPI_PHONE_NUMBER_ID` | معرّف رقم Vapi مع fallback في كود الهاتف؛ `apps/web/src/app/dashboard/channels/phone-actions.ts` | اختياري بحسب fallback |
| `VAPI_PHONE_NUMBER` | رقم Vapi مع fallback في كود الهاتف؛ `apps/web/src/app/dashboard/channels/phone-actions.ts` | اختياري بحسب fallback |
| `VAPI_WEBHOOK_SECRET` | سر التحقق من Vapi webhook؛ `apps/web/src/lib/runtime/security.ts` | اختياري في الكود، والتحقق يتغير بوجوده |
| `WHATSAPP_ACCESS_TOKEN` | رمز وصول WhatsApp في محلل credentials؛ `apps/web/src/lib/credentials/resolve.ts` | مطلوب عند تفعيل WhatsApp |
| `WHATSAPP_APP_SECRET` | سر توقيع Meta البديل؛ `apps/web/src/lib/runtime/security.ts` | اختياري إذا توفر متغير سر Meta الرئيسي |
| `WHATSAPP_VERIFY_TOKEN` | رمز تحقق WhatsApp webhook؛ `apps/web/src/app/api/whatsapp/webhook/route.ts` | مطلوب للتحقق |

## 📜 الأوامر المتاحة
| الأمر | ما يفعله وفق التعريف/الملفات |
|---|---|
| `npm run dev` | تشغيل `apps/web` عبر workspace الجذر؛ `package.json` |
| `npm run build` | بناء تطبيق الويب؛ `package.json` و`apps/web/package.json` |
| `npm run start` | تشغيل build تطبيق الويب؛ `apps/web/package.json` |
| `npm run lint` | تشغيل ESLint؛ `apps/web/package.json` |
| `npm run typecheck` | تشغيل `tsc --noEmit`؛ `apps/web/package.json` |
| `npm run test` | تشغيل `node --test`؛ `apps/web/package.json` |
| `npm run migrate` | تشغيل migration runner العام؛ `packages/db/package.json` |
| `npm run migrate:up` | تمرير `up` إلى migration runner؛ `packages/db/package.json` |
| `npm run migrate:down` | تمرير `down` إلى migration runner؛ `packages/db/package.json` |
| `npm run drizzle:generate` | توليد migrations عبر Drizzle Kit؛ `packages/db/package.json` |
| `npm run drizzle:migrate` | تطبيق migrations عبر Drizzle Kit؛ `packages/db/package.json` |
| `npm run drizzle:studio` | تشغيل Drizzle Studio؛ `packages/db/package.json` |
| `npm run start` داخل `tools/mcp-server` | تشغيل `tools/mcp-server/index.js`؛ `tools/mcp-server/package.json` |
| `npm run dev` داخل `tools/mcp-server` | تشغيل خادم MCP مع `node --watch`؛ `tools/mcp-server/package.json` |

## 🌐 النشر
- إعداد Vercel الموجود هو `apps/web/vercel.json` ويحتوي على `$schema` فقط؛ لا توجد إعدادات build أو domains إضافية فيه.
- إعداد Next.js يضبط `output: "standalone"` و`compress: true` و`poweredByHeader: false`؛ `apps/web/next.config.ts`.
- سير عمل GitHub Actions باسم `outbox-cron` يعمل كل خمس دقائق أو يدوياً؛ `.github/workflows/outbox-cron.yml`.
- سير العمل يستدعي مسارات `outbox` و`followup` و`sla` و`quotes-expire` و`appointment-reminders` و`workflows` و`campaigns` باستخدام `CRON_SECRET`.
- الرابط المنشور المضمن كقيمة افتراضية في سير العمل هو `https://frontdesk-ai-eosin.vercel.app`، ولا يثبت المستودع أن الرابط متاح حالياً.
- لا توجد إعدادات Docker أو Firebase في المستودع.

## 🔒 الأمان
- حماية جلسة Supabase للمسارات `/dashboard` و`/onboarding` و`/settings` عبر middleware؛ `apps/web/src/lib/supabase/middleware.ts`.
- عزل المستأجرين عبر `organization_id` وRLS وسياسات PostgreSQL في `packages/db/migrations/0001_complete_rls_and_triggers.sql` و`0035_tenant_membership_and_binding_hardening.sql`.
- المطابقة الواردة للقناة exact binding ولا تستخدم fallback إلى أول مؤسسة؛ `apps/web/src/lib/runtime/tenant.ts`.
- يتحقق WhatsApp وInstagram من توقيع Meta، وSMS من توقيع Twilio، والهاتف من سر Vapi؛ `apps/web/src/lib/runtime/security.ts` ومسارات webhooks.
- يمنع cron الطلبات غير الموقعة ويشترط secret بطول 32 على الأقل؛ `apps/web/src/lib/cron/auth.ts`.
- تُسجل أحداث webhook مع idempotency لمنع المعالجة المكررة؛ `apps/web/src/lib/channels/idempotency.ts` ومسارات webhooks.
- أدوات الوكيل مسجلة ومقيدة بسياسة allow/deny وبالتأكيد للعمليات الكتابية؛ `apps/web/src/lib/ai/registry.ts` و`apps/web/src/lib/runtime/tools.ts`.
- يدعم التطبيق أدوار الفريق، ويمنع `read_only` من مسارات تصدير contacts/leads؛ `apps/web/src/lib/team.ts` و`apps/web/src/app/api/export/`.
- يعزل استرجاع المعرفة بـ`organization_id` ويستخدم بحثاً معجمياً؛ `apps/web/src/lib/knowledge/retrieval.ts`.
- لا يوجد ملف `firestore.rules` ولا آلية RLS منفصلة عن سياسات migrations؛ غير موثّق في المستودع وجود تدقيق أمني خارجي.

## 📄 الترخيص
- لا يوجد ملف `LICENSE` أو `COPYING` في المستودع.
- يعرّف `packages/db/package.json` الترخيص `UNLICENSED`؛ أما بقية الحزم فلا تحدد ترخيصاً منفصلاً.
- شروط إعادة الاستخدام أو حقوق النشر التفصيلية: **غير موثّق في المستودع**.
