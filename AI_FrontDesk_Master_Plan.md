# 🚀 خطة مشروع AI Front Desk — التقرير الشامل
> **مُعدّ بواسطة 4 وكلاء AI متخصصين عبر CodeCraft API**
> نماذج: Claude Opus 5.5 · Claude Fable 5.1 · GPT-5.5 Pro

---

## المنتج باختصار

> **موظف AI واحد يمثل الشركة على Phone + WhatsApp + Instagram**
> يستقبل → يفهم → يرد → يؤهل → يحجز → يتابع → يستعيد العميل → يسجل كل شيء

---

# 🎯 الجزء الأول: الاستراتيجية (وكيل Claude Opus 5.5)

## 1. أفضل Niche للبدء

### ✅ الفائز: Beauty, Health & Wellness
**Med Spa + Dental Clinics + Aesthetic Clinics + Premium Salons**

| السبب | التفاصيل |
|-------|-----------|
| **Instagram-Heavy** | 80% من الـ leads تأتي من Instagram DM — المنافسون لا يغطونها |
| **قيمة عميل عالية** | قيمة العميل الواحد $150–$1,000+ — يدفعون بسهولة $99/شهر |
| **Appointment-Based** | الحجز هو العمل الأساسي — يتطابق 100% مع USP المشروع |
| **Lost Lead = Gold** | لا يتابعون العملاء القدامى — Follow-up Engine يجلب تحويلات مباشرة |
| **انخفاض Churn** | لا تُغلق كالمطاعم — عميل طويل الأمد |

> **الاستراتيجية:** أول 6 أشهر في هذا الـ Niche حصراً. ابدأ بمدينة واحدة.

### 🥈 الثاني: Home Services (HVAC, Plumbing, Roofing)
مناسب لكن يخسرون عملاء بآلاف الدولارات من مكالمات فائتة.

---

## 2. نموذج التسعير

| الخطة | السعر | المحتوى | الجمهور |
|-------|-------|---------|---------|
| **Starter** | $49/شهر | WhatsApp + Instagram auto-reply، 300 دقيقة، حجز تقويم | صالون صغير / عيادة صغيرة |
| **Growth** ⭐ | $99/شهر | كل ما سبق + Phone AI Agent، Follow-up Engine، 600 دقيقة، Lost Lead Recovery | Med Spa / Dental — 90% سيختارونه |
| **Pro** | $199/شهر | Unlimited conversations، Revenue Dashboard، VIP Support، متعدد المواقع | عيادات كبيرة / فروع متعددة |

**الإضافات:**
- Setup Fee: **$149 لمرة واحدة** (تدريب AI + إعداد التقويم)
- Pay-Per-Recovery: **$5 لكل حجز** يُستعاد من Lost Leads
- White Label: **$299** للوكالات التسويقية

> **التركيز:** كل التسويق يدفع نحو خطة $99 — هي الربح الحقيقي

---

## 3. نقطة البيع الفريدة (USP)

### الموضع: "ليس موظف استقبال، بل محرك إيرادات"

| المنافس | نقطة ضعفه | كيف نتفوق |
|---------|-----------|-----------|
| **Goodcall / Rosie** | Phone فقط — لا Instagram ولا WhatsApp | **Omnichannel:** 3 قنوات في مكان واحد |
| **Smith.ai** | موظفون بشريون، تكلفة $200+ | **100% AI:** رد خلال 5 ثوانٍ، ربع التكلفة |
| **Retell** | للمطورين فقط — Dashboard معقد | **Revenue Dashboard:** نُظهر الدولارات لا المحادثات |
| **الجميع** | يتركون المكالمة الفائتة | **Lost Lead Recovery:** متابعة تلقائية 30 يوماً |

**Tagline:**
> *"We Don't Just Answer. We Book & Recover Revenue While You Sleep."*

---

## 4. خطة الوصول لأول 10 عملاء

```
1. اختر Niche واحد + مدينة واحدة
2. أنشئ Demo Video 30 ثانية: Instagram DM → AI يرد → حجز تلقائي
3. أضف Lead Calculator في الموقع: "كم تخسر شهرياً من مكالمات فائتة؟"
4. تجربة $1 لأسبوع (ليس مجانياً — Free = لا يأخذونك بجدية)
5. احصل على 3 عملاء تجريبيين بسعر مخفض → اجمع Case Studies
6. "Dr. Smile Dental — $3,200 إيرادات إضافية في 14 يوماً" → اعرضه كـ Social Proof
7. صفحة مقارنة: "AI Front Desk vs Goodcall vs Smith.ai" → SEO قوي
8. برنامج Agency Partners: $30/شهر عمولة لكل وكالة تُحيل عميلاً
9. Onboarding خلال 24 ساعة من الشراء
10. Report شهري لكل عميل: "AI أجرى 124 محادثة → 42 حجز = $4,200 إيرادات"
```

---

# 🏗️ الجزء الثاني: الهندسة المعمارية (وكيل Claude Fable 5.1)

## 1. Tech Stack الكامل

| الطبقة | التقنية | السبب |
|--------|---------|-------|
| **Frontend + Backend** | Next.js 14 App Router | قاعدة كود واحدة: Dashboard + Webhooks + API |
| **Database + Auth** | Supabase | PostgreSQL + RLS للـ Multi-tenant + Realtime |
| **Phone AI** | Retell AI | Low latency، `transfer_call()` native، أكثر استقراراً من Twilio |
| **WhatsApp** | Meta Cloud API | رسمي، يدعم Template Messages |
| **Instagram** | Instagram Graph API | Webhooks للـ DMs |
| **LLM** | Claude API (Tool Calling) | أفضل دقة في Tool Calling |
| **SMS** | Twilio | معياري، موثوق، TCPA compliant |
| **Calendar** | Google Calendar API | الأوسع استخداماً |
| **Queue/Cron** | Upstash QStash + Trigger.dev | Follow-up Engine |
| **Hosting** | Vercel + Supabase Cloud | Auto-scale، بدون إدارة servers |
| **Payments** | Stripe | معياري للـ SaaS |
| **Monitoring** | Sentry + Vercel Analytics | تتبع الأخطاء |

---

## 2. System Architecture

```
                    CHANNELS
    ─────────────────────────────────────────
    Phone (Retell)    WhatsApp    Instagram
          │               │           │
          └───────────────┼───────────┘
                          ▼
              /api/webhook/[channel]
              (Unified Ingress - Next.js)
                          │
                          ▼
                    MESSAGE ROUTER
                    (tenant resolver)
                          │
                          ▼
                  ┌───────────────┐
                  │   AI BRAIN    │
                  │               │
                  │  System Prompt│
                  │  + Business   │
                  │    Context    │
                  │  + Claude API │
                  └───────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
          TOOLS      MEMORY       KNOWLEDGE
       (7 functions) (Supabase)   (Knowledge Base)
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
Calendar    CRM      Twilio SMS
(Google)  (Supabase)
                          │
                          ▼
                  FOLLOW-UP ENGINE
                  (QStash Cron)
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         WhatsApp      SMS        Instagram
```

---

## 3. AI Agent Tools (7 وظائف)

```typescript
// Tool 1: من هذا المتصل؟
lookup_customer(phone: string)
→ Supabase: SELECT * FROM contacts WHERE phone = ?

// Tool 2: ما هي معلومات الشركة؟
get_business_info()
→ Services, prices, hours, location, FAQs

// Tool 3: هل يوجد موعد متاح؟
check_availability(service: string, date: string)
→ Google Calendar API → free slots

// Tool 4: احجز موعداً
create_booking(name, phone, service, slot)
→ INSERT appointments + Google Calendar event + SMS confirmation

// Tool 5: سجّل عميلاً محتملاً
create_lead(contact_data, intent, estimated_value)
→ INSERT leads + enroll in follow-up sequence

// Tool 6: أرسل رسالة نصية
send_sms(phone, message)
→ Twilio SMS API

// Tool 7: حوّل للإنسان
transfer_call(reason)
→ Retell/Vapi transfer to human agent
```

---

## 4. مثال عملي لـ Tool Calling Flow

```
عميل (WhatsApp): "أريد موعد غداً للتنظيف"
        ↓
AI Brain يستلم الرسالة
        ↓
lookup_customer("+966501234567") → عميل جديد، لا سجل
        ↓
get_business_info() → خدمة تنظيف = $50، 60 دقيقة
        ↓
check_availability("تنظيف", "2026-09-28") → [10:00, 11:30, 14:00]
        ↓
AI يرد: "متوفر الساعة 10:00 أو 11:30. أيهما يناسبك؟"
        ↓
العميل: "11:30"
        ↓
create_booking("أحمد", "+966...", "تنظيف", "11:30")
        ↓
send_sms("+966...", "تم تأكيد موعدك الساعة 11:30 غداً ✅")
        ↓
[تلقائي] تذكير SMS قبل 24 ساعة
```

---

## 5. نقاط الصعوبة التقنية وحلولها

| التحدي | الحل |
|--------|------|
| **Retell يتوقع <2s من API** | Cache business_hours، indexes على `start_time`، Edge Functions |
| **Timezone Hell** | Retell → UTC، تخزّن UTC، تعرض بـ timezone الشركة |
| **Multi-tenancy** | `org_id` على كل جدول + Supabase RLS policies إلزامي |
| **Tool Calling Loops** | حدّ `max_tool_calls = 5`، log كل استدعاء |
| **Webhook Duplicates** | Idempotency keys على كل webhook handler |
| **TCPA Compliance للـ SMS** | quiet hours 9am-8pm، STOP keyword handler |

---

# 🗄️ الجزء الثالث: قاعدة البيانات (18 جدول)

```sql
-- ══════════════════════════════════════
-- ENUMS
-- ══════════════════════════════════════
CREATE TYPE channel_type AS ENUM ('phone', 'whatsapp', 'instagram', 'web');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'hot', 'warm', 'cold', 'booked', 'lost');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'no_show', 'cancelled');
CREATE TYPE followup_trigger AS ENUM ('missed_call', 'no_show', 'new_lead', 'after_hours');
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'stopped');
CREATE TYPE usage_type AS ENUM ('call_minute', 'sms', 'ai_token');
CREATE TYPE plan_type AS ENUM ('starter', 'growth', 'pro');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');

-- ══════════════════════════════════════
-- CORE: Organizations & Users
-- ══════════════════════════════════════
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        plan_type DEFAULT 'starter',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  role        user_role DEFAULT 'member',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_org ON users(org_id);

-- ══════════════════════════════════════
-- BUSINESSES (tenant's clients)
-- ══════════════════════════════════════
CREATE TABLE businesses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT,
  address        TEXT,
  website        TEXT,
  timezone       TEXT DEFAULT 'UTC',
  business_hours JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_businesses_org ON businesses(org_id);

-- ══════════════════════════════════════
-- CHANNELS
-- ══════════════════════════════════════
CREATE TABLE channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type        channel_type NOT NULL,
  channel_id  TEXT NOT NULL,  -- phone number / WABA number / Instagram ID
  config      JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_channels_business ON channels(business_id);

-- ══════════════════════════════════════
-- CONTACTS (end customers)
-- ══════════════════════════════════════
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  business_id   UUID NOT NULL REFERENCES businesses(id),
  phone         TEXT,
  name          TEXT,
  email         TEXT,
  instagram_id  TEXT,
  whatsapp_id   TEXT,
  source        channel_type,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_contacts_business ON contacts(business_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);

-- ══════════════════════════════════════
-- CONVERSATIONS & MESSAGES
-- ══════════════════════════════════════
CREATE TABLE conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  business_id  UUID NOT NULL REFERENCES businesses(id),
  contact_id   UUID REFERENCES contacts(id),
  channel_type channel_type NOT NULL,
  status       TEXT DEFAULT 'open',
  ai_handled   BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conversations_business ON conversations(business_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
  content         TEXT NOT NULL,
  channel         channel_type,
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- ══════════════════════════════════════
-- LEADS
-- ══════════════════════════════════════
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  business_id     UUID NOT NULL REFERENCES businesses(id),
  contact_id      UUID REFERENCES contacts(id),
  conversation_id UUID REFERENCES conversations(id),
  status          lead_status DEFAULT 'new',
  intent          TEXT,
  score           INTEGER DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  estimated_value DECIMAL(10,2),
  source          channel_type,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leads_business ON leads(business_id);
CREATE INDEX idx_leads_status ON leads(status);

-- ══════════════════════════════════════
-- CALLS
-- ══════════════════════════════════════
CREATE TABLE calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  business_id      UUID NOT NULL REFERENCES businesses(id),
  contact_id       UUID REFERENCES contacts(id),
  retell_call_id   TEXT UNIQUE,
  duration_seconds INTEGER DEFAULT 0,
  recording_url    TEXT,
  transcript       TEXT,
  ai_summary       TEXT,
  status           TEXT DEFAULT 'completed',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_calls_business ON calls(business_id);
CREATE INDEX idx_calls_created ON calls(created_at DESC);

-- ══════════════════════════════════════
-- SERVICES & APPOINTMENTS
-- ══════════════════════════════════════
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id),
  business_id      UUID NOT NULL REFERENCES businesses(id),
  name             TEXT NOT NULL,
  price            DECIMAL(10,2),
  duration_minutes INTEGER DEFAULT 60,
  description      TEXT,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE appointments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  contact_id  UUID REFERENCES contacts(id),
  service_id  UUID REFERENCES services(id),
  lead_id     UUID REFERENCES leads(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      appointment_status DEFAULT 'scheduled',
  notes       TEXT,
  gcal_event_id TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_appointments_business ON appointments(business_id);
CREATE INDEX idx_appointments_start ON appointments(start_time);
CREATE INDEX idx_appointments_status ON appointments(status);

-- ══════════════════════════════════════
-- FOLLOW-UP ENGINE
-- ══════════════════════════════════════
CREATE TABLE follow_up_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  name        TEXT NOT NULL,
  trigger     followup_trigger NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE follow_up_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    UUID NOT NULL REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
  step_order     INTEGER NOT NULL,
  delay_minutes  INTEGER NOT NULL,  -- delay from previous step
  channel        TEXT DEFAULT 'sms' CHECK (channel IN ('sms', 'whatsapp')),
  template       TEXT NOT NULL,     -- supports {{name}}, {{business_name}}
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_steps_sequence ON follow_up_steps(sequence_id, step_order);

CREATE TABLE follow_up_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  business_id  UUID NOT NULL REFERENCES businesses(id),
  contact_id   UUID NOT NULL REFERENCES contacts(id),
  sequence_id  UUID NOT NULL REFERENCES follow_up_sequences(id),
  lead_id      UUID REFERENCES leads(id),
  current_step INTEGER DEFAULT 0,
  next_send_at TIMESTAMPTZ NOT NULL,
  status       enrollment_status DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_enrollments_next_send ON follow_up_enrollments(next_send_at) 
  WHERE status = 'active';  -- Partial index for cron efficiency
CREATE INDEX idx_enrollments_contact ON follow_up_enrollments(contact_id);

-- ══════════════════════════════════════
-- AI AGENT & KNOWLEDGE BASE
-- ══════════════════════════════════════
CREATE TABLE ai_agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id),
  business_id    UUID UNIQUE NOT NULL REFERENCES businesses(id),
  system_prompt  TEXT NOT NULL,
  model          TEXT DEFAULT 'claude-opus-latest',
  temperature    DECIMAL(3,2) DEFAULT 0.3,
  tools_enabled  JSONB DEFAULT '["lookup_customer","get_business_info","check_availability","create_booking","create_lead","send_sms","transfer_call"]',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  business_id UUID NOT NULL REFERENCES businesses(id),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_knowledge_business ON knowledge_base(business_id);

-- ══════════════════════════════════════
-- BILLING & USAGE
-- ══════════════════════════════════════
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID UNIQUE NOT NULL REFERENCES organizations(id),
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  plan                    plan_type DEFAULT 'starter',
  status                  TEXT DEFAULT 'active',
  minutes_limit           INTEGER DEFAULT 200,
  sms_limit               INTEGER DEFAULT 500,
  minutes_used            INTEGER DEFAULT 0,
  sms_used                INTEGER DEFAULT 0,
  period_end              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  business_id UUID REFERENCES businesses(id),
  type        usage_type NOT NULL,
  quantity    DECIMAL(10,4) NOT NULL,
  cost        DECIMAL(10,6) DEFAULT 0,
  reference_id TEXT,  -- call_id / message_id
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_org_type ON usage_logs(org_id, type, created_at DESC);

-- ══════════════════════════════════════
-- RLS POLICIES (Supabase)
-- ══════════════════════════════════════
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Example RLS policy
CREATE POLICY "Users see own org data" ON businesses
  FOR ALL USING (org_id = (
    SELECT org_id FROM users WHERE id = auth.uid()
  ));
```

---

# 🗺️ الجزء الرابع: خارطة طريق MVP (وكيل GPT-5.5 Pro)

## المرحلة 1: الأساس — أسبوعان

**الهدف:** نظام CRM قابل للاستخدام بدون AI

**✅ Checklist المهام:**
- [ ] `npx create-next-app@latest` + Supabase project
- [ ] Auth: تسجيل دخول + Org creation + Invite
- [ ] DB migrations: كل الجداول + RLS policies
- [ ] **اختبر RLS بحسابين — لا تتجاوز هذه الخطوة**
- [ ] Business Setup UI: المعلومات + الخدمات + ساعات العمل
- [ ] Calendar داخلي: عرض المواعيد + إضافة يدوية
- [ ] Contacts/Customers صفحة بسيطة
- [ ] Dashboard هيكلي: Calls / Leads / Bookings (أرقام فارغة)

**🧪 اختبار نهاية المرحلة:**
> مستخدم جديد → Signup → Business setup → إضافة عميل يدوياً → موعد → يبقى بعد logout. اختبر بحسابين: لا يرى كلٌّ منهما بيانات الآخر.

**⚠️ أصعب تحدٍّ:** Supabase RLS — اكتبه صح من البداية أو ستُعاد كتابته لاحقاً.

---

## المرحلة 2: AI Receptionist — 3.5–4 أسابيع (الأصعب)

**الهدف:** AI يرد على مكالمة حقيقية ويحجز موعداً. WhatsApp bot يرد على الأسئلة.

**✅ Checklist المهام:**

**A. Phone AI (Retell + Claude):**
- [ ] Retell setup: إنشاء Agent، شراء رقم، `api/retell/webhook`
- [ ] System Prompt ديناميكي: `{{business.name}}`, `{{business.services}}`, `{{business.hours}}`
- [ ] 4 Tool Functions في Claude:
  - `check_availability(date, service)` → Supabase
  - `book_appointment(name, phone, start, service)` → INSERT + SMS
  - `reschedule_appointment(id, new_time)`
  - `transfer_to_human(reason)` → fallback
- [ ] API Routes للـ tools: يجب أن تستجيب في < 1.5 ثانية
- [ ] Log كل مكالمة في جدول `calls`
- [ ] Post-call webhook: transcript + recording + AI summary

**B. WhatsApp Bot:**
- [ ] Meta Developer App + Permanent Token + Webhook verification
- [ ] Inbound handler → نفس 4 tools من Phone
- [ ] Inbox UI: كل المحادثات (Phone + WhatsApp) في مكان واحد

**🧪 اختبار نهاية المرحلة:**
> اتصل وقل "أريد موعداً غداً الساعة 3" → تحقق من إدراج صف في `appointments` بـ timezone صحيح. أرسل WhatsApp "ما هي ساعات العمل؟" → هل يرد بدون هلوسة؟

**⚠️ أصعب تحدٍّ:** **Latency + Timezone Hell.** Retell → UTC. أضف indexes على `start_time`. Cache الـ business_hours.

---

## المرحلة 3: Follow-up Engine — أسبوعان

**الهدف:** متابعة تلقائية تحوّل الـ Missed Calls والـ No-Shows إلى حجوزات.

**✅ Checklist المهام:**
- [ ] Twilio Setup: رقم + `api/twilio/webhook`
- [ ] Sequence Builder UI: trigger → steps بتأخيرات + templates
- [ ] **Automation Cron** (QStash/Trigger.dev كل 5 دقائق):
  - يبحث عن `enrollments WHERE next_send_at <= now()`
  - يرسل SMS عبر Twilio
  - يُحدّث `current_step` و `next_send_at`
- [ ] Triggers التلقائية:
  - Missed Call → Retell webhook `status = no_answer` → تسجيل
  - No-Show → Cron يُحدّد المواعيد الفائتة → تسجيل
  - After-hours → رسالة خارج ساعات العمل → تسجيل
- [ ] Stop Condition: رد "STOP" أو حجز → إلغاء التسجيل فوراً
- [ ] Analytics: Sent / Delivered / Replied / Booked / Recovery Rate

**🧪 اختبار نهاية المرحلة:**
> اتصل وأغلق قبل الرد → هل تصلك SMS خلال دقيقتين؟ رد "STOP" → هل توقف النظام؟

**⚠️ أصعب تحدٍّ:** **Idempotency + TCPA Compliance.** القوانين تُلزم quiet hours (9am–8pm) وـ STOP handling.

---

## المرحلة 4: SaaS & Billing — 2.5–3 أسابيع

**الهدف:** يشترك غريب، يدفع، ويُحدَّد بخطته دون تدخلٍ منك.

**✅ Checklist المهام:**
- [ ] Stripe Products: Starter $49 / Growth $99 / Pro $199
- [ ] `api/stripe/webhook`: handle `checkout.completed`, `invoice.paid`, `subscription.updated`
- [ ] **Entitlement Middleware** `checkLimits(business_id)`:
  - يُغلق الـ AI calls والـ SMS عند الوصول للحد
  - يُظهر Upgrade Modal
- [ ] Usage Metering: counter على كل Retell call end + Twilio send
- [ ] Onboarding Flow:
  1. Welcome → 2. Business Setup → 3. شراء رقم Retell → 4. **زر "اتصل بـ AI الآن"** → 5. إعداد WhatsApp → ✅
- [ ] Billing UI: خطط + استهلاك شريطي + فواتير
- [ ] Rate limiting + Sentry + DB backups يومية

**🧪 اختبار نهاية المرحلة:**
> Incognito → Signup → Stripe test card `4242...` → هل تُفعَّل المزايا فوراً؟ تجاوز الحد → هل يُوقف مع رسالة ودودة؟

**⚠️ أصعب تحدٍّ:** **Stripe Webhook sync.** ابنِ Reconciliation Job ليلي يتحقق من Stripe vs DB.

---

## قواعد المطور المنفرد

> 1. **لا تبني Landing Page قبل المرحلة 4.** استخدم Notion للبيع
> 2. **أعطِ 3 عملاء تجريبيين المرحلة 2 مجاناً.** أخطاؤهم تساوي أسبوعين من الكود
> 3. **قطع النطاق بلا رحمة:** في MVP لا reschedule بـ AI، لا multi-language، لا voice cloning
> 4. **الخطوة الأولى غداً:** `npx create-next-app@latest` + Supabase project + اختبار RLS

---

# 📊 ملخص تنفيذي

```
النتيجة المتوقعة:
 المرحلة 1 (أسبوعان)     → CRM قابل للبيع وحده
 المرحلة 2 (4 أسابيع)    → AI يحجز مواعيد — القيمة الأساسية
 المرحلة 3 (أسبوعان)     → Follow-up → العائد على الاستثمار واضح
 المرحلة 4 (3 أسابيع)    → SaaS جاهز للبيع العام
─────────────────────────
 المجموع: ~11 أسبوع لـ MVP كامل
 الـ Niche الأول: Beauty & Health Wellness
 السعر الرئيسي: $99/شهر (Growth Plan)
 أول عميل مستهدف: خلال نهاية المرحلة 2
```

---

*تم إعداد هذا التقرير بواسطة 4 وكلاء AI متخصصين عبر CodeCraft API*
*Claude Opus 5.5 (استراتيجية) · Claude Fable 5.1 (هندسة + DB) · GPT-5.5 Pro (خارطة الطريق)*
