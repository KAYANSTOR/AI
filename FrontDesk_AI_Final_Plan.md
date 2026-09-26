# 🚀 FrontDesk AI — الوثيقة الموحدة النهائية
> **دمج خطة الهندسة (فكره.txt) + استراتيجية الوكلاء (Claude · GPT)**
> هذه هي المرجع الوحيد للمشروع من الآن.

---

# الجزء الأول: التعريف والاستراتيجية

## ما هو FrontDesk AI؟

> **موظف AI واحد يمثل الشركة على Phone + WhatsApp + Instagram**
> عميل واحد، عقل AI واحد، جميع القنوات مرتبطة بنفس ملف العميل.

```
استقبال → فهم → رد → تأهيل → عرض السعر → حجز → تأكيد → متابعة → استعادة → تسجيل
```

---

## السوق والـ Niche الأول

### الـ Niche المختار: Beauty, Health & Wellness
**Med Spa + Dental Clinics + Aesthetic Clinics + Premium Salons**

| السبب | التفاصيل |
|-------|----------|
| **Instagram-Heavy** | 80% من الـ leads تأتي من Instagram DM — المنافسون لا يغطونها |
| **قيمة عميل عالية** | $150–$1,000+ لكل عميل |
| **Appointment-Based** | الحجز هو جوهر العمل |
| **Lost Lead = Gold** | لا يتابعون العملاء — Follow-up يجلب تحويلات مباشرة |
| **انخفاض Churn** | عميل دائم |

> **القاعدة:** أول 6 أشهر في هذا الـ Niche حصراً، مدينة واحدة.

---

## نموذج التسعير

| الخطة | السعر | المحتوى |
|-------|-------|---------|
| **Starter** | $49/شهر | WhatsApp + Instagram، 300 دقيقة، حجز، Lead tracking |
| **Growth** ⭐ | $99/شهر | + Phone AI، Follow-up Engine، 600 دقيقة، Lost Lead Recovery |
| **Pro** | $199/شهر | Unlimited، Revenue Dashboard، Multi-location، VIP Support |

**الإضافات:** Setup Fee $149 · Pay-Per-Recovery $5/lead

---

## USP — التفوق على المنافسين

| المنافس | نقطة ضعفه | ميزتنا |
|---------|-----------|--------|
| **Goodcall / Rosie** | Phone فقط، لا Instagram | Omnichannel حقيقي |
| **Smith.ai** | موظفون بشريون، $200+ | 100% AI، رد في 5 ثوانٍ |
| **Retell** | للمطورين فقط | Revenue Dashboard: نُظهر الدولارات |
| **الجميع** | يتركون Missed Call | Lost Lead Recovery تلقائي 30 يوماً |

**Tagline:** *"We Don't Just Answer. We Book & Recover Revenue While You Sleep."*

---

# الجزء الثاني: الهندسة المعمارية

## القرار الأساسي: AI Brain واحد لكل القنوات

```
                    AI BRAIN
                       │
            ┌──────────┼──────────┐
            │          │          │
         Phone      WhatsApp   Instagram
         (Vapi)   (Meta API)  (Graph API)
            │          │          │
            └──────────┼──────────┘
                       │
                  Unified CRM
                       │
               Follow-up Engine
```

---

## System Architecture

```
                     FRONTDESK AI
                          │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
  PHONE               WHATSAPP            INSTAGRAM
     │                    │                    │
     └────────────────────┼────────────────────┘
                          │
                  CHANNEL ADAPTERS
                          │
                  EVENT NORMALIZER
                          │
                  MESSAGE / EVENT BUS
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
      CONTACTS       CONVERSATIONS      LEADS
          └───────────────┼───────────────┘
                          │
                   AI ORCHESTRATOR
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   KNOWLEDGE           TOOLS             MEMORY
                    (Cal/CRM/SMS)
                          │
                   RESPONSE POLICY
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Reply       Booking    Handoff
                          │
                  FOLLOW-UP ENGINE
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
      WhatsApp        Instagram           SMS
```

---

## Tech Stack

| الطبقة | التقنية | السبب |
|--------|---------|-------|
| **Frontend + Backend** | Next.js 14 App Router + TypeScript | قاعدة كود واحدة |
| **UI** | Tailwind + shadcn/ui + RTL | سريع وجميل |
| **Database + Auth** | Supabase PostgreSQL | RLS + Realtime + Cron + Edge Functions + pgvector |
| **AI Layer** | Vercel AI SDK + AI Gateway | Provider-agnostic |
| **Voice** | Vapi | Webhooks + Tool Calling + Transfer |
| **WhatsApp** | Meta WhatsApp Cloud API | رسمي + Embedded Signup |
| **Instagram** | Instagram Graph API | `instagram_business_manage_messages` |
| **SMS** | Twilio | TCPA Compliant |
| **Calendar V1** | Internal Calendar | لا حاجة لـ Google OAuth في البداية |
| **Calendar V1.1** | Google Calendar API | بعد الاستقرار |
| **Queue/Cron** | Supabase Cron + Edge Functions | بدون Queue خارجي في MVP |
| **Payments** | Stripe + abstraction layer | Subscription + Usage-based |
| **Monitoring** | Sentry + Vercel Analytics | |

---

## المبدأ: Event-Driven

كل شيء يدخل النظام كـ Event موحد:

```json
{
  "type": "message.received",
  "channel": "whatsapp",
  "external_event_id": "abc123",
  "contact_external_id": "987",
  "timestamp": "...",
  "payload": {}
}
```

قائمة Events:
```
call.started / call.ended
message.received / message.sent
lead.created / lead.updated / lead.booked / lead.lost / lead.recovered
appointment.created / appointment.cancelled / appointment.no_show
followup.scheduled / followup.sent / followup.failed / followup.stopped
human.handoff / subscription.changed
```

---

## قواعد API الخارجية

### WhatsApp — قاعدة الـ 24 ساعة
```
رسالة من العميل → نافذة 24 ساعة
  نعم → رسالة حرة
  لا  → Template معتمد فقط

الـ Follow-up Engine يفحص الأهلية برمجياً — ليس قرار الـ LLM
```

### Instagram — قاعدة البدء
```
المحادثة تبدأ من المستخدم فقط
لا يمكن مراسلة حساب عشوائي
Follow-up عبر Instagram فقط إذا بدأ المستخدم المحادثة
```

### Eligibility Check (قبل كل إرسال)
```
Channel Policy + Consent + Window + Opt-out + Quiet Hours (9am-8pm) + Subscription Limits
```

---

# الجزء الثالث: قاعدة البيانات

## الكيانات الكاملة

```
CORE
├── organizations
├── organization_members (roles: owner/admin/agent/viewer)
├── business_profiles
├── services
├── business_hours

CHANNELS
├── channels (type: phone/whatsapp/instagram/website/sms/email)
├── channel_accounts
├── provider_credentials  ← مشفرة، لا tokens في browser

CONTACTS
├── contacts
├── contact_identities  ← يربط WA + IG + Phone لشخص واحد

CONVERSATIONS
├── conversations
├── messages (direction: inbound/outbound، type: text/image/audio/video/file)
├── webhook_events  ← UNIQUE(provider, external_event_id) = Idempotency

LEADS
├── leads (status: new/qualified/contacted/booked/waiting/won/lost)
├── lead_events (lead.created / lead.called / lead.booked / lead.recovered)

APPOINTMENTS
├── appointments (status: pending/confirmed/cancelled/completed/no_show)

FOLLOW-UP ENGINE
├── followup_sequences (trigger: missed_call/no_show/new_lead/after_hours)
├── followup_steps (delay_minutes، channel، template)
├── followup_enrollments (state machine: scheduled→sending→sent→replied/cancelled)

KNOWLEDGE & AI
├── knowledge_base
├── ai_agents

BILLING
├── subscriptions (minutes_used، sms_used، period_end)
├── usage_logs (type: call_minute/sms/ai_token)
```

---

## القطع الهندسية الأساسية

### Contact Identity — شخص واحد عبر كل القنوات
```sql
contact_identities (
  id, contact_id, channel,
  external_user_id,    -- Instagram ID
  external_username,   -- @handle
  external_phone       -- WhatsApp/Phone
)
-- Instagram + WhatsApp + Phone = ONE CONTACT
```

### Webhook Idempotency
```sql
webhook_events (
  provider, external_event_id  -- UNIQUE constraint
  payload, processing_status, error
)
-- Webhook #1 → process | Webhook #2 → ignore
```

### Follow-up State Machine
```sql
followup_enrollments.status:
scheduled → eligible → sending → sent → replied/cancelled

-- Partial Index للأداء:
CREATE INDEX ON followup_enrollments(next_send_at)
WHERE status = 'active';
```

---

# الجزء الرابع: الـ AI Agent

## القواعد الذهبية

### يستطيع
- البحث والقراءة
- حجز / إلغاء / إعادة جدولة
- تسجيل lead
- إرسال رسالة عبر الأدوات
- طلب تحويل للإنسان

### لا يستطيع
- اختراع سعر أو موعد أو سياسة
- الوصول المباشر لـ DB بـ SQL
- إرسال رسالة خارج سياسة القناة
- تجاوز حدود الاشتراك
- كشف معلومات عميل لآخر

---

## AI Tools (10)

```typescript
get_business_info()
get_service(service_id)
get_service_price(service_name)
find_available_slots(service, date)
create_appointment(contact, service, slot)
cancel_appointment(appointment_id)
reschedule_appointment(appointment_id, new_slot)
get_customer(phone)
create_lead(contact_data, intent, value)
request_human_handoff(reason)
```

---

## Prompt Architecture (طبقات)

```
SYSTEM POLICY    → لا تختلق معلومات
BUSINESS CONTEXT → الخدمات، الأسعار، الساعات
CHANNEL POLICY   → قواعد WhatsApp / Instagram
CUSTOMER CONTEXT → تاريخ العميل
MEMORY           → ملخص المحادثة + Customer Facts
TOOLS            → تعريف الأدوات
```

---

## AI Flow

```
Incoming Event
      ↓
Identify Organization + Contact
      ↓
Load Conversation + Business Context (cached)
      ↓
AI Orchestrator → Tool Calls → Validate → Execute
      ↓
Generate Response → Response Policy Check
      ↓
Send via Channel API → Store Message + Update Lead
```

---

# الجزء الخامس: خارطة طريق MVP

## المرحلة 1: الأساس — أسبوعان
**الهدف:** CRM جاهز بدون AI

- [ ] Next.js + Supabase
- [ ] DB كاملة + **RLS بحسابين — إلزامي**
- [ ] Auth + Business Profile + Services + Hours
- [ ] Internal Calendar
- [ ] Contacts + Leads
- [ ] Dashboard هيكلي
- [ ] `webhook_events` + `provider_credentials` جاهزة

**اختبار:** مستخدمان لا يريان بيانات بعضهما.
**التحدي:** Supabase RLS — اكتبه صح من البداية.

---

## المرحلة 2: AI Receptionist — 4 أسابيع (الأصعب)
**الهدف:** AI يرد على مكالمة ويحجز. WhatsApp bot يعمل.

**Phone (Vapi):**
- [ ] Vapi setup + رقم + `api/vapi/webhook`
- [ ] System Prompt ديناميكي per-business
- [ ] 4 Tools: `find_available_slots`, `create_appointment`, `get_customer`, `request_human_handoff`
- [ ] API Routes < 1.5 ثانية
- [ ] Idempotency على كل webhook

**WhatsApp:**
- [ ] Meta App + Webhook + Event Normalizer
- [ ] Contact Identity: ربط phone بالـ contact
- [ ] Eligibility Check: 24h window؟
- [ ] نفس Tools من Phone

**Unified Inbox:**
- [ ] Phone + WhatsApp في مكان واحد

**اختبار:** اتصل وقل "موعد غداً الساعة 3" → تحقق من الصف في DB بـ timezone صحيح.
**التحدي:** Latency < 2s + Timezone Hell.

---

## المرحلة 3: Follow-up Engine — أسبوعان
**الهدف:** Missed Calls وNo-Shows تتحول إلى حجوزات.

- [ ] Twilio Setup
- [ ] Sequence Builder UI
- [ ] **Eligibility Checker قبل كل إرسال**
- [ ] Supabase Cron كل 5 دقائق
- [ ] Triggers: Missed Call + No-Show + After-hours
- [ ] State Machine محكم
- [ ] Stop on STOP/booking
- [ ] Analytics: Sent/Delivered/Replied/Booked/Recovery Rate

**اختبار:** أغلق قبل الرد → SMS خلال دقيقتين؟
**التحدي:** Idempotency + TCPA + Quiet Hours.

---

## المرحلة 4: SaaS & Billing — 3 أسابيع
**الهدف:** غريب يشترك ويدفع بدون تدخل.

- [ ] Stripe Products: $49 / $99 / $199
- [ ] Stripe Webhooks: checkout + invoice + subscription
- [ ] `checkLimits(org_id)` على كل Vapi call + SMS
- [ ] Usage Metering
- [ ] Onboarding: Welcome → Setup → رقم → **"اتصل الآن"** → WhatsApp → ✅
- [ ] Billing UI
- [ ] Reconciliation Job ليلي

**اختبار:** تجاوز الحد → يُوقف بشكل ودود.
**التحدي:** Stripe Webhook sync.

---

## الملخص الزمني

```
المرحلة 1 (أسبوعان)   → CRM + RLS محكم
المرحلة 2 (4 أسابيع)  → AI Phone + WhatsApp
المرحلة 3 (أسبوعان)   → Follow-up Engine
المرحلة 4 (3 أسابيع)  → SaaS + Billing
─────────────────────────
~11 أسبوع → MVP جاهز للسوق
```

---

## V-Roadmap

```
V1   → Phone + WhatsApp + AI + Follow-up + Billing
V1.1 → Instagram + Google Calendar
V1.2 → Website Chat Widget
V2   → Email + Messenger + Advanced CRM + AI Analytics
V3   → White Label + Agency Dashboard
```

---

## قواعد المطور المنفرد

> 1. لا Landing Page قبل المرحلة 4 — استخدم Notion للبيع
> 2. أعطِ 3 عملاء تجريبيين المرحلة 2 مجاناً
> 3. لا تبدأ Vapi قبل أن تنتهي المرحلة 1 كاملاً
> 4. القطع في MVP: لا multi-language، لا voice cloning، لا rescheduling بالـ AI
> 5. **الخطوة الأولى غداً:** `npx create-next-app@latest` + Supabase + اختبار RLS

---

# الجزء السادس: استراتيجية الاتصالات — بدون شركة الاتصالات

> **المبدأ الأساسي:** صاحب الشركة لا يتصل بشركة الاتصالات، لا ينقل رقمه، لا يشتري رقمًا جديدًا.

---

## المشكلة التي نحلها

```
❌ الطريقة المعقدة (ما لن نطلبه):
SIP + BYOC + PSTN + Carrier Provisioning + نقل الرقم

✅ الطريقة البسيطة (ما نبنيه):
الرقم الحالي + Call Forwarding + AI
```

---

## 1. المكالمات — Call Forwarding فقط

صاحب الشركة يُبقي رقمه الحالي المنشور للعملاء. نستخدم خاصية تحويل المكالمات الموجودة أصلاً في هاتفه/الشبكة:

```
العميل
   ↓
رقم الشركة الحالي (+967 XXXXXXXX)
   ↓
لا يرد صاحب الشركة (أو مشغول / غير متاح)
   ↓
Call Forwarding (من الهاتف نفسه)
   ↓
رقم Vapi الداخلي (رقم تقني — لا يُنشر للعملاء)
   ↓
AI يرد
```

**أنواع التحويل المدعومة:**
- عند عدم الرد
- عند الانشغال
- عند عدم التوفر
- جميع المكالمات

> **ملاحظة:** رقم Vapi الداخلي هو **رقم تقني للاستقبال** فقط — لا يظهر للعملاء ولا يُنشر.

---

## 2. تجربة الإعداد (Onboarding Flow)

```
STEP 1 — أدخل رقمك الحالي
┌──────────────────────────────┐
│  Enter your existing number  │
│  +967 ____________________   │
│          [ Continue ]        │
└──────────────────────────────┘

STEP 2 — متى يرد AI؟
○ عندما لا أجيب (موصى به)
○ عندما يكون الخط مشغولًا
○ عندما لا أكون متاحًا
○ جميع المكالمات

STEP 3 — تفعيل التحويل
[ Open Phone Settings Guide ]
→ يعرض التطبيق الكود المناسب لمشغل الشبكة

STEP 4 — اختبار الاتصال
[ اتصل من هاتف آخر الآن ]
✓ رقمك تم التحقق منه
✓ التحويل يعمل
✓ AI رد
✓ الصوت يعمل
✓ جاهز
```

---

## 3. Carrier Profiles — أكواد التحويل حسب المشغل

```
carrier_profiles
├── Yemen — Sabafon
├── Yemen — MTN
├── Yemen — Y Telecom
├── KSA — STC
├── KSA — Mobily
├── UAE — Etisalat
├── ...
└── Other / Manual Setup
```

إذا لم يكن المشغل في القائمة:
```
افتح إعدادات الهاتف → المكالمات → تحويل المكالمات
→ عند عدم الرد → أدخل: [رقم Vapi الداخلي]
```

لا نطلب من العميل الاتصال بشركة الاتصالات — فقط إعدادات الهاتف.

---

## 4. المكالمات الصادرة (Outbound) — V1

```
Inbound  → رقم الشركة الحالي (يعمل ممتازًا)
Outbound → AI لا يتصل هاتفياً في V1
```

بدلاً من ذلك، الـ Follow-up يكون عبر:
- WhatsApp (الأولوية)
- SMS عبر Twilio

```
مكالمة فائتة
      ↓
AI استقبل (أو لم يصل التحويل)
      ↓
Create Lead
      ↓
WhatsApp: "مرحبًا أحمد، بخصوص اتصالك بنا..."
```

> هذا مناسب جداً لمنتجنا — WhatsApp هي قوة المشروع الحقيقية.

---

## 5. WhatsApp — نفس رقم الشركة الحالي

```
رقم WhatsApp الحالي للشركة
      ↓
Meta WhatsApp Business Platform (Embedded Signup)
      ↓
FrontDesk AI
```

**لا رقم WhatsApp جديد من عندنا.**

عند Onboarding، النظام يفحص حالة الرقم تلقائياً ويعرض المسار المدعوم:

```
فحص حالة الرقم
   ├── WhatsApp Personal → مسار التحويل للـ Business
   ├── WhatsApp Business App → مسار ترقية API
   └── جديد → مسار التسجيل المباشر
```

---

## 6. Instagram — نفس حساب الشركة

```
Instagram Business Account الحالي
      ↓
Instagram Messaging API
      ↓
FrontDesk AI (نفس AI Brain)
```

---

## 7. Architecture المحدّث

```
FRONTDESK AI

Existing Phone ──► Call Forwarding ──► Vapi (داخلي) ──► AI Brain
                                                              │
WhatsApp ────────────────────────► Meta Cloud API ──────► AI Brain
                                                              │
Instagram ──────────────────────► Graph API ────────────► AI Brain
                                                              │
                                                     Unified Contact Profile
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          ▼                   ▼                   ▼
                                         CRM             Calendar          Follow-up Engine
                                                                                  │
                                                                    ┌─────────────┴─────────────┐
                                                                    ▼                           ▼
                                                                WhatsApp                      SMS
```

---

## 8. واجهة "Connect Your Business"

ما يرى صاحب الشركة:

```
┌──────────────────────────────┐
│  📞 Existing Phone           │
│  +967 XXXXXXXX               │
│  ✓ Connected — Forwarding On │
└──────────────────────────────┘
┌──────────────────────────────┐
│  🟢 WhatsApp                 │
│  ✓ Connected                 │
└──────────────────────────────┘
┌──────────────────────────────┐
│  📸 Instagram                │
│  ✓ Connected                 │
└──────────────────────────────┘
```

ما لا يراه:
```
❌ SIP    ❌ BYOC    ❌ PSTN    ❌ Carrier Provisioning    ❌ رقم جديد
```

---

## 9. تحكم إيقاف AI

```
┌─────────────────────────────────┐
│  AI Receptionist   🟢 Active    │
│                  [ Pause AI ]   │
└─────────────────────────────────┘
```

عند الإيقاف:
```
AI OFF → العميل يلغي Call Forwarding من الهاتف → الرقم يعود لعمله الطبيعي
```

---

## 10. جداول DB المضافة

```sql
-- Carrier Profiles
carrier_profiles (
  id, country_code, operator_name,
  forward_on_no_answer_code,   -- مثل: **62*{number}#
  forward_on_busy_code,
  forward_all_code,
  cancel_forward_code,
  setup_instructions_url,
  is_manual_only               -- true = لا كود تلقائي، دليل يدوي فقط
)

-- Phone Connections
phone_connections (
  id, organization_id, business_id,
  existing_phone_number,        -- رقم الشركة الحالي
  internal_vapi_number,         -- رقم Vapi الداخلي (لا يُنشر)
  carrier_profile_id,
  forward_type,                 -- no_answer / busy / unavailable / all
  forwarding_status,            -- active / inactive / pending_test
  last_verified_at
)
```

---

## 11. Telephony Roadmap

```
MVP (الآن)
├── Existing Number
├── Call Forwarding (خاصية الهاتف)
├── Vapi (استقبال بعد التحويل)
└── Human Fallback عبر WhatsApp

V2 (لاحقاً — للمتقدمين)
├── SIP Trunking
├── BYOC (Bring Your Own Carrier)
└── Number Porting
```

> SIP/BYOC = خيار متقدم اختياري، **ليس شرطاً لاستخدام المنتج**.

---

# الجزء السابع: سجل الإنجاز (Changelog & Progress)

## ما تم إنجازه حتى الآن (نهاية المرحلة 1):
1. **تهيئة المشروع:** إنشاء هيكل مستودع GitHub الموحد باستخدام Next.js 14 App Router.
2. **قاعدة البيانات:** تصميم SQL Schema كاملة على Supabase متضمنة 18 جدولاً (من بينها `carrier_profiles` و `phone_connections`).
3. **الأمان والمصادقة:** إعداد Row Level Security (RLS) لعزل البيانات بين المنظمات، وبرمجة صفحات تسجيل الدخول (`/login`) وإنشاء الحساب (`/signup`).
4. **النشر السحابي:** إنشاء مشروع Vercel وربط متغيرات البيئة الخاصة بـ Supabase به ليتم نشر الواجهة مباشرة من GitHub.
5. **لوحة التحكم:** برمجة `Sidebar` و `Header` والصفحة الرئيسية للوحة التحكم كواجهة مبدئية احترافية (`/dashboard`).

---
*هندسة: فكره.txt · استراتيجية: Claude Opus 5.5 + Claude Fable 5.1 + GPT-5.5 Pro*
