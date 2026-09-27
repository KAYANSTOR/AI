# 🤖 FrontDesk AI — AI Agent Runtime & Customer Interaction Specification

> هذه الوثيقة جزء رسمي من خطة FrontDesk AI، وتشرح بالتفصيل كيف يعمل الوكيل الخاص بكل شركة، وكيف يتكيّف مع فئة النشاط، وكيف يتعامل مع العملاء عبر Phone وWhatsApp وInstagram وأي قناة مستقبلية.
>
> **قاعدة مهمة:** لا يوجد Agent مختلف مبني من الصفر لكل صناعة. يوجد **Agent Runtime واحد**، وتختلف هوية الوكيل وسياقه وصلاحياته وأدواته وسير العمل حسب الشركة ونوع نشاطها والقدرات المفعّلة.

---

## 1. الهدف المعماري

FrontDesk AI عبارة عن منصة Multi-Tenant تحتوي على نواة واحدة، وكل شركة تحصل على **AI Agent منطقي معزول** داخل هذه النواة.

الوكيل ليس مجرد Chatbot. وظيفته الكاملة هي:

```
استقبال الحدث
→ تحديد الشركة
→ تحديد العميل
→ تحميل سياق الشركة
→ تحديد القدرة/نية العميل
→ تطبيق السياسات والصلاحيات
→ استدعاء الأدوات عند الحاجة
→ تنفيذ العملية
→ بناء الرد
→ إرسال الرد عبر القناة
→ حفظ كل شيء
→ متابعة الحالة لاحقًا
```

الـAI Model مسؤول عن الفهم والتوليد واتخاذ القرار داخل الحدود المعطاة له، بينما البيانات الحقيقية والعمليات التنفيذية تأتي من الأنظمة الموثوقة والأدوات.

---

## 2. Agent Runtime الموحد

### البنية الرسمية

```
                           INCOMING CHANNELS
        ┌────────────────────┬────────────────────┬───────────────────┐
        │                    │                    │
      Phone               WhatsApp            Instagram
        │                    │                    │
        └────────────────────┴────────────────────┴───────────────────┘
                                 │
                                 ▼
                       CHANNEL ADAPTERS
                 (Normalize provider payloads)
                                 │
                                 ▼
                         UNIFIED INGRESS
                                 │
                                 ▼
                         TENANT RESOLVER
                    company/business/org context
                                 │
                                 ▼
                      CONTACT IDENTITY RESOLVER
                  existing/new/merged customer identity
                                 │
                                 ▼
                      CONVERSATION MANAGER
                  history + state + channel context
                                 │
                                 ▼
                       BUSINESS CONTEXT LOADER
       ┌───────────────────────────────────────────────────────────────┐
       │ business profile + business type + capabilities + policies    │
       │ services + products + prices + hours + FAQs + knowledge       │
       └───────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                        AGENT ORCHESTRATOR
       ┌──────────────────┬───────────────┬───────────────────────────┐
       │ Intent / State   │ Policy Engine │ Tool Registry             │
       └──────────────────┴───────────────┴───────────────────────────┘
                                 │
                                 ▼
                             LLM MODEL
                                 │
                  ┌──────────────┴───────────────┐
                  │                              │
               Reply                         Tool Call
                  │                              │
                  │                       Validate Permission
                  │                              │
                  │                       Execute Trusted Tool
                  │                              │
                  │                       Persist Result
                  │                              │
                  └──────────────┬───────────────┘
                                 ▼
                       RESPONSE POLICY CHECK
                                 │
                                 ▼
                         CHANNEL SENDER
                                 │
                                 ▼
                      CUSTOMER / HUMAN AGENT
                                 │
                                 ▼
                         AUDIT + ANALYTICS
```

### قاعدة الفصل

يجب عدم دمج المسؤوليات التالية في ملف أو خدمة واحدة:

- Channel Adapter
- Tenant Resolution
- Contact Identity
- Business Context
- Agent Orchestration
- Tool Execution
- Response Sending
- Audit / Analytics

الهدف هو منع بناء "Agent كبير" يصعب اختباره وصيانته.

---

## 3. الشركة تحصل على Agent خاص بها منطقيًا

عند إنشاء الشركة:

```
Create Company
      ↓
Select Business Type
      ↓
Load Business Type Profile
      ↓
Enable Capabilities
      ↓
Create Agent Profile
      ↓
Resolve Allowed Tools
      ↓
Resolve Workflows
      ↓
Generate Runtime Context
      ↓
Agent Ready
```

لا يلزم تشغيل نموذج LLM مستقل لكل شركة.

التمييز بين الشركات يتم بواسطة:

- company/business identifier
- agent configuration
- business context
- enabled capabilities
- allowed tools
- policies
- customer data
- conversation state
- channel connections

وبذلك يكون لكل شركة Agent مستقل من ناحية السلوك والبيانات والصلاحيات، مع Runtime مشترك.

---

## 4. Business Type Profiles

نوع النشاط ليس كودًا منفصلاً.

هو **Profile Configuration**.

مثال:

```
Business Type: restaurant

Capabilities:
✓ products
✓ pricing
✓ orders
✓ order_status
✓ reservations
✓ customer_support
✓ follow_up

Tools:
✓ search_products
✓ check_stock
✓ create_order
✓ get_order_status
✓ book_reservation
✓ request_human_handoff
```

مثال آخر:

```
Business Type: home_services

Capabilities:
✓ service_catalog
✓ service_area
✓ site_visit
✓ scheduling
✓ quotes
✓ leads
✓ follow_up

Tools:
✓ get_service_info
✓ calculate_quote
✓ check_available_slots
✓ create_visit
✓ create_lead
✓ request_human_handoff
```

### القاعدة

الفئة تحدد **القدرات الافتراضية**، لكن صاحب الشركة يستطيع تشغيل أو إيقاف القدرات المسموح بها.

```
Business Type
      ↓
Default Capabilities
      ↓
Business Overrides
      ↓
Enabled Capabilities
      ↓
Allowed Tools
      ↓
Allowed Workflows
      ↓
Agent Context
```

---

## 5. Capability Registry

يجب أن يكون هناك Registry مركزي يعرّف كل Capability.

مثال منطقي:

```ts
CapabilityDefinition {
  id
  name
  description
  business_types[]
  required_data[]
  allowed_tools[]
  supported_channels[]
  workflow_ids[]
  dashboard_module
}
```

مثال:

```
Capability = appointments

required_data:
- service
- customer
- date/time

allowed_tools:
- check_availability
- create_appointment
- cancel_appointment
- reschedule_appointment

workflow:
appointment_booking
```

### النتيجة

إذا لم تكن Capability مفعّلة:

- لا تظهر في لوحة التحكم.
- لا تظهر كأداة للـAgent.
- لا يسمح Runtime بتنفيذها.
- لا يسمح Prompt للوكيل بالتصرف على أساسها.

---

## 6. Tool Registry والصلاحيات

الـAgent لا يحصل على كل الأدوات.

يتم حساب الأدوات الفعلية لكل شركة في وقت التشغيل:

```
Business
+
Enabled Capabilities
+
Plan Entitlements
+
Channel Permissions
+
Business Policies
        ↓
Effective Tool Set
```

مثال:

```
Restaurant
  ↓
orders + reservations
  ↓
search_products
check_stock
create_order
get_order_status
book_reservation
```

### قاعدة أمان

حتى لو حاول الـLLM استدعاء Tool غير موجودة أو غير مسموحة:

```
Tool Request
    ↓
Permission Check
    ├── allowed → execute
    └── denied  → reject + log
```

الـLLM لا يملك صلاحية تنفيذ أي عملية حساسة مباشرة.

---

## 7. أنواع الأدوات

### أدوات قراءة

لا تغيّر البيانات:

```
get_business_info()
get_service_info()
search_products()
check_stock()
get_customer()
check_availability()
get_order_status()
```

### أدوات كتابة/تنفيذ

تغيّر حالة النظام:

```
create_lead()
create_order()
create_appointment()
cancel_appointment()
reschedule_appointment()
create_quote()
create_service_visit()
```

### أدوات التواصل

```
send_sms()
send_whatsapp()
request_human_handoff()
```

### أدوات النظام

```
log_event()
update_conversation_state()
schedule_follow_up()
```

---

## 8. قاعدة الثقة بالبيانات

الـAI لا يكون مصدر الحقيقة للبيانات التجارية.

مصدر الحقيقة هو النظام/قاعدة البيانات/الأداة.

مثال:

العميل:
> كم سعر المنتج X؟

الوكيل لا يعتمد على ذاكرته القديمة.

بل:

```
get_product(X)
      ↓
database result
      ↓
current price = 25,000
      ↓
AI response
```

إذا لم توجد قيمة مؤكدة:

```
No trusted value
      ↓
Do not invent
      ↓
ask / verify / handoff
```

وينطبق ذلك على:

- السعر
- المخزون
- الموعد
- حالة الطلب
- سياسات الإلغاء
- العروض
- بيانات العميل

---

## 9. Prompt Architecture

الـPrompt النهائي يبنى من طبقات، وليس نصًا ثابتًا واحدًا:

```
1. GLOBAL SYSTEM POLICY
2. SAFETY / COMPLIANCE POLICY
3. BUSINESS TYPE POLICY
4. BUSINESS PROFILE
5. ENABLED CAPABILITIES
6. CHANNEL POLICY
7. CUSTOMER CONTEXT
8. CONVERSATION HISTORY / SUMMARY
9. KNOWLEDGE CONTEXT
10. AVAILABLE TOOLS
11. TOOL USAGE RULES
12. RESPONSE STYLE
```

### مثال

```
SYSTEM
أنت موظف استقبال تابع للشركة...

BUSINESS
اسم الشركة...
ساعات العمل...
الخدمات...
الأسعار...

CAPABILITIES
appointments
leads
follow_up

CUSTOMER
الاسم...
رقم الهاتف...
الطلبات السابقة...

CHANNEL
WhatsApp rules...

TOOLS
check_availability
create_appointment
request_human_handoff
```

---

## 10. Customer Identity — العميل عبر كل القنوات

الشخص الواحد يجب ألا يصبح ثلاثة عملاء فقط لأنه استخدم ثلاث قنوات.

```
Customer
  ├── Phone identity
  ├── WhatsApp identity
  ├── Instagram identity
  └── Future channel identities
```

### مثال

```
+9677XXXXXXX
       │
       ├── Phone
       ├── WhatsApp
       └── Instagram-linked identity
                ↓
          ONE CUSTOMER
```

عند وصول حدث جديد:

```
Incoming Event
      ↓
Provider Identity
      ↓
Resolve Contact Identity
      ├── matched → existing contact
      └── no match → create contact
```

يجب ألا يتم دمج هويتين تلقائيًا إلا وفق قواعد موثوقة.

---

## 11. العميل الجديد والعميل العائد

### عميل جديد

```
Message
 ↓
Resolve identity → not found
 ↓
Create customer/contact
 ↓
Start conversation
 ↓
Qualify
 ↓
Lead (when applicable)
```

### عميل عائد

```
Message
 ↓
Resolve identity → found
 ↓
Load customer context
 ↓
Load relevant history
 ↓
Continue conversation
```

الوكيل يستطيع استخدام المعلومات المفيدة المخزنة، لكن لا يعيد عرض بيانات حساسة أو غير ضرورية لمجرد وجودها في السجل.

---

## 12. Conversation State

كل محادثة لها حالة، وليست مجرد رسائل متتابعة.

مثال:

```
NEW
 ↓
DISCOVERY
 ↓
QUALIFYING
 ↓
WAITING_FOR_CUSTOMER
 ↓
ACTION_REQUIRED
 ↓
BOOKED / ORDERED / RESOLVED
 ↓
FOLLOW_UP
 ↓
CLOSED
```

مثال للحجز:

```
customer asks for booking
        ↓
collect service
        ↓
collect date
        ↓
check availability
        ↓
offer slots
        ↓
customer selects
        ↓
create booking
        ↓
confirm
```

---

## 13. Memory Architecture

يجب التفريق بين أنواع الذاكرة.

### A. Short-Term Conversation Memory

آخر رسائل المحادثة وما يلزم لإكمال المهمة الحالية.

### B. Conversation Summary

ملخص ثابت يحد من إرسال تاريخ كامل إلى النموذج عند كل رسالة.

### C. Customer Facts

معلومات عملية مستقرة:

- الاسم
- رقم الهاتف
- تفضيلات يوافق النظام على حفظها
- معلومات الخدمة المطلوبة
- بيانات مرتبطة بالطلبات أو المواعيد

### D. Business Knowledge

المعلومات التي تقدمها الشركة:

- الخدمات
- المنتجات
- الأسئلة الشائعة
- السياسات
- تعليمات العمل

### E. Live State

بيانات متغيرة يجب قراءتها من المصدر الحقيقي:

- المخزون
- المواعيد
- حالة الطلب
- الأسعار المتغيرة

### القاعدة

لا تُعامل Live State كذاكرة LLM.

---

## 14. Knowledge Base

يمكن لصاحب الشركة إضافة:

```
PDF
FAQ
Service descriptions
Policies
Product information
Internal instructions
```

لكن Knowledge Base لا تمنح الـAgent صلاحية تنفيذ أي شيء.

المعرفة تجيب:
> ما هي السياسة؟

الأداة تنفذ:
> إنشاء الحجز.

هذا الفصل ضروري.

---

## 15. Incoming Message Flow — الرسائل

مثال WhatsApp:

```
Customer
  ↓
Meta Webhook
  ↓
Idempotency Check
  ↓
Normalize Event
  ↓
Resolve Business
  ↓
Resolve Customer
  ↓
Load/Open Conversation
  ↓
Persist Inbound Message
  ↓
Load Agent Runtime Context
  ↓
Intent / State Detection
  ↓
Tool Calls if needed
  ↓
Validate / Execute
  ↓
Generate Response
  ↓
Response Policy Check
  ↓
Send WhatsApp
  ↓
Persist Outbound Message
  ↓
Update Conversation
  ↓
Audit / Analytics
```

---

## 16. Incoming Call Flow — المكالمات

المسار المنطقي:

```
Customer
  ↓
Company Existing Phone
  ↓
Call Forwarding
  ↓
Technical Voice Number / Voice Provider
  ↓
Voice Agent
  ↓
Speech-to-Text / Voice turn
  ↓
Agent Runtime
  ↓
Tools
  ↓
Response
  ↓
Text-to-Speech
  ↓
Customer
```

### بعد المكالمة

```
Call End
 ↓
store call metadata
 ↓
store transcript when available
 ↓
generate summary
 ↓
update customer / lead
 ↓
trigger follow-up when rules match
```

---

## 17. استخدام رقم الشركة الحالي

المسار المستهدف للـMVP هو:

```
Existing company phone
        ↓
Call forwarding
        ↓
AI voice endpoint
```

لا يلزم أن يحصل صاحب الشركة على رقم منشور جديد من المنصة.

لكن رقمًا تقنيًا داخليًا قد يكون مطلوبًا خلف الكواليس من مزود الصوت لاستقبال التحويل.

### حدود مهمة

- المنصة لا تتحكم في شبكة الاتصالات نفسها.
- نجاح التحويل يعتمد على دعم المشغل/الهاتف لهذه الخاصية.
- يجب وجود دليل إعداد يدوي عندما لا تتوفر أتمتة للمشغل.
- لا يوجد افتراض أن أي رقم هاتف تقليدي يمكن اعتراض مكالماته مباشرة عبر الويب بدون طبقة اتصالات.

---

## 18. Outbound Voice

في MVP لا يجب افتراض أن AI يستطيع الاتصال خارجيًا من رقم الشركة الحالي بمجرد وجود Inbound Voice.

```
Inbound:
Existing Number → Forward → AI

Outbound MVP:
AI → WhatsApp / SMS / supported messaging
```

الاتصالات الصادرة من رقم الشركة تُترك لمسار Voice متقدم لاحقًا إذا تم دعم SIP/BYOC/Provider مناسب.

---

## 19. Human Handoff

ليس كل شيء يجب أن يجيب عنه AI.

### حالات التحويل

```
Unknown critical information
Complaints
Sensitive requests
Customer explicitly asks for human
Tool failure
Business-defined escalation
Policy restriction
High-value manual review
```

المسار:

```
Customer
 ↓
AI detects escalation
 ↓
request_human_handoff(reason)
 ↓
conversation.ai_handled = false
 ↓
notify staff
 ↓
human takes over
 ↓
AI remains paused for that conversation
 ↓
human returns control when appropriate
```

### لا يجوز

أن يستمر AI بالرد فوق الموظف البشري بعد استلام المحادثة إلا وفق حالة واضحة تسمح بذلك.

---

## 20. Response Policy

قبل إرسال أي رد:

```
Draft Response
      ↓
Check:
- prohibited claims?
- invented data?
- channel rules?
- business policy?
- customer privacy?
- tool result consistency?
- escalation requirement?
      ↓
Approved → send
Rejected → regenerate / handoff
```

الهدف تقليل:

- الهلوسة
- الوعود غير المصرح بها
- كشف البيانات
- الرد خارج سياسة الشركة

---

## 21. Channel Abstraction

الـAgent Runtime يجب ألا يعرف تفاصيل Meta أو WhatsApp أو Instagram أو مزود الصوت داخل منطق القرار الأساسي.

يستلم Event موحدًا:

```ts
UnifiedInboundEvent {
  companyId
  businessId
  channel
  externalConversationId
  externalCustomerId
  customerPhone?
  messageId
  messageType
  text?
  media?
  timestamp
}
```

ثم يقوم Channel Adapter بإرسال الرد المناسب:

```
Unified Response
      ↓
Channel Adapter
      ├── WhatsApp sender
      ├── Instagram sender
      ├── SMS sender
      └── Voice response
```

بهذا يمكن إضافة قناة جديدة دون إعادة بناء Agent Brain.

---

## 22. Unified Customer Experience

الهدف أن تكون القنوات واجهات مختلفة لنفس الـAgent.

مثال:

```
Monday:
Customer → WhatsApp
"أريد موعد"

Tuesday:
Customer → Phone
"أنا أحمد، اتصلت أمس"

Wednesday:
Customer → Instagram
"هل تم تأكيد الموعد؟"
```

إذا نجح Contact Identity:

```
          ONE CUSTOMER
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   WhatsApp   Phone   Instagram
      \\        │        //
             ONE PROFILE
                 │
            ONE CONTEXT
```

---

## 23. مثال كامل — شركة صيانة

نوع النشاط:

```
home_services
```

القدرات:

```
service_catalog
quotes
site_visit
appointments
leads
follow_up
```

العميل يرسل:

> السلام عليكم، عندي مكيف لا يبرد وأريد فني اليوم.

### Runtime

```
1. Identify Business
2. Identify Customer
3. Load Business Type
4. Resolve capabilities
5. Detect intent = service_request
6. Extract issue = AC not cooling
7. Check required information
8. Ask for location / preferred time
9. create service visit / appointment when confirmed
10. confirm with trusted data
```

### لا يجوز

أن يخترع AI سعر زيارة إذا لم يوجد سعر معتمد في النظام.

---

## 24. مثال كامل — متجر

العميل:

> أريد 20 قطعة من المنتج X.

```
Intent = sales/order

Search product
      ↓
Check current price
      ↓
Check stock
      ↓
If enough:
   create order
Else:
   explain availability
```

إذا كان المخزون 12 فقط:

لا يقول:
> متوفر 20.

بل يعتمد على نتيجة النظام الحقيقية.

---

## 25. مثال كامل — تنظيم أعراس

العميل:

> زواجي في 20 ديسمبر وعدد المدعوين 250.

```
Intent = event_lead
 ↓
Collect:
date
guest_count
venue
package
addons
 ↓
create_lead()
 ↓
show approved package information
 ↓
book consultation when requested
 ↓
follow-up workflow
```

لا يحتاج Core إلى "Wedding Agent" منفصل.

يكفي:

```
business_type = wedding_events
capabilities = events + packages + leads + appointments
```

---

## 26. أمثلة للأفعال التي يجب منعها من الـLLM

الـLLM لا ينفذ SQL.

ولا يغيّر:

- السعر
- الخطة
- حالة الاشتراك
- صلاحيات المستخدم
- رقم الحساب
- إعدادات القناة الحساسة
- بيانات العميل الحرجة

إلا عبر Tool/Service مصرح بها.

### القاعدة

```
LLM = Decide / Explain
Backend = Authorize / Validate
Tool = Execute
Database = Source of Truth
```

---

## 27. Multi-Tenant Isolation

كل حدث وكل Tool Call وكل قراءة يجب أن تكون مرتبطة بحدود الشركة.

```
Organization
   ↓
Business
   ↓
Agent
   ↓
Conversation
   ↓
Customer
   ↓
Tools / Data
```

يجب عدم السماح باستدعاء:

```
get_customer(phone)
```

بشكل مجرد بدون تحديد سياق الشركة والصلاحية.

المفهوم المنطقي:

```
get_customer(
  business_id,
  customer_identity
)
```

ويجب أن تقوم طبقة الخادم بالتحقق من ownership/RLS قبل إرجاع البيانات.

---

## 28. Idempotency

أحداث القنوات قد تتكرر.

مثال:

```
Webhook #A → process
Webhook #A → duplicate
```

النتيجة:

```
first → execute
duplicate → ignore/replay stored result
```

ويجب تطبيق ذلك على:

- inbound message
- call event
- payment event
- tool-triggered side effect
- follow-up send

خصوصًا الأدوات التي تُنشئ:

- Order
- Appointment
- Lead
- Payment-related record

---

## 29. Observability

كل Agent Run مهم يجب أن يترك سجلًا يمكن تتبعه.

```
Agent Run
 ├── company_id
 ├── business_id
 ├── conversation_id
 ├── channel
 ├── model
 ├── latency
 ├── tool_calls
 ├── result
 ├── error
 └── created_at
```

وسجل الأدوات:

```
Tool Call
 ├── tool_name
 ├── arguments (safe/redacted where required)
 ├── authorization result
 ├── execution result
 ├── latency
 └── error
```

هذا ضروري لتشخيص:

> لماذا قال AI هذا الرد؟

> لماذا لم يحجز؟

> لماذا تم تحويل المحادثة؟

---

## 30. Agent Run Lifecycle

كل دورة استجابة:

```
RECEIVED
 ↓
CONTEXT_LOADING
 ↓
REASONING
 ↓
TOOL_EXECUTION (0..N)
 ↓
RESPONSE_GENERATION
 ↓
RESPONSE_VALIDATION
 ↓
SENT
 ↓
PERSISTED
```

حالات الخطأ:

```
FAILED
RETRYING
ESCALATED
CANCELLED
```

يجب وجود حد أعلى لعدد دورات Tool Calls لمنع Loop لا نهائي.

مثال مبدئي:

```
max_tool_calls_per_turn = 5
```

ويمكن تغييره لاحقًا حسب الحاجة.

---

## 31. Business Workflow Engine

ليس كل تصرف يحتاج قرارًا حرًا من الـLLM.

عندما يكون المسار معروفًا، الأفضل استخدام Workflow State Machine.

مثال:

```
Lead
 ↓
Qualified
 ↓
Quote Requested
 ↓
Quote Sent
 ↓
Consultation
 ↓
Booked
 ↓
Completed
```

الـAI يفسر كلام العميل ويحدد الحالة المناسبة، لكن انتقال الحالة يجب أن يمر عبر قواعد النظام.

```
AI intent
   ↓
Workflow rule
   ↓
State transition
   ↓
Side effect/tool
```

---

## 32. Follow-up Engine وعلاقته بالAgent

الـAgent لا يرسل كل المتابعات بنفسه في لحظة المحادثة.

بل قد يقرر:

```
create_lead()
   ↓
schedule follow-up
   ↓
Follow-up Engine
   ↓
send at correct time
```

وهكذا يفصل النظام:

- Conversation response
- Background automation

وهذا يقلل الفوضى ويجعل المتابعة قابلة للتكرار والقياس.

---

## 33. Onboarding الذي يبني Agent الشركة

التجربة المقترحة:

```
STEP 1
Create company

STEP 2
Choose business type

STEP 3
Review default capabilities

STEP 4
Business profile
- name
- description
- phone
- address
- hours
- timezone

STEP 5
Add services/products

STEP 6
Add prices/policies/FAQ

STEP 7
Connect channels

STEP 8
Configure Agent style

STEP 9
Test AI

STEP 10
Activate
```

### اختبار تفعيل الوكيل

قبل Active يجب اختبار:

```
✓ Business context loads
✓ Customer identity works
✓ Channel receives inbound event
✓ AI answers
✓ Allowed tool executes
✓ Disallowed tool is denied
✓ Human handoff works
✓ Response is persisted
✓ No cross-company data leakage
```

---

## 34. لوحة التحكم المطلوبة

كل شركة تحتاج رؤية ما يفعله الوكيل.

### Agent Overview

```
AI Status: Active / Paused
Current Business Type
Enabled Capabilities
Connected Channels
Human Handoff Status
```

### Conversations

```
Customer
Channel
Last Message
AI / Human
Lead status
Current workflow
```

### Agent Activity

```
Recent AI Runs
Tool calls
Failures
Escalations
Average response time
```

### Knowledge

```
Services
Products
Prices
FAQs
Policies
Documents
```

---

## 35. Acceptance Criteria النهائية للـAgent Runtime

### Multi-Industry

- [ ] نفس Agent Runtime يخدم كل الفئات.
- [ ] Business Type يحدد capabilities الافتراضية.
- [ ] الشركة تستطيع تشغيل/إيقاف capabilities المسموحة.
- [ ] الأدوات الفعلية تحل ديناميكيًا لكل شركة.

### Customer

- [ ] العميل الواحد يمكن ربطه بعدة قنوات.
- [ ] يتم التعرف على العميل القديم.
- [ ] لا يتم دمج هويات مختلفة بشكل غير موثوق.
- [ ] Conversation state محفوظ.

### AI

- [ ] Prompt ديناميكي حسب الشركة.
- [ ] AI لا يخترع بيانات تجارية.
- [ ] Live data تأتي من أدوات موثوقة.
- [ ] Tool permission enforced server-side.
- [ ] يوجد حد لـTool loops.
- [ ] توجد Response Policy.

### Communication

- [ ] Phone وWhatsApp وInstagram تستخدم نفس الـAgent Brain.
- [ ] لكل قناة Adapter مستقل.
- [ ] الرسائل تُحفظ كـinbound/outbound events.
- [ ] المكالمات تُحفظ مع metadata/transcript عند توفره.

### Human Handoff

- [ ] يمكن للعميل طلب موظف بشري.
- [ ] يمكن للنظام التصعيد تلقائيًا.
- [ ] عند انتقال المحادثة للبشر يتوقف AI بشكل واضح.
- [ ] سبب التحويل محفوظ.

### Security

- [ ] Multi-tenant isolation عبر server-side authorization + RLS.
- [ ] لا يوجد وصول SQL مباشر من الـLLM.
- [ ] Idempotency على webhooks والعمليات الحساسة.
- [ ] Audit trail للأدوات المهمة.

---

## 36. القرار المعماري النهائي

```
DO NOT BUILD:

RestaurantAgent
ClinicAgent
WeddingAgent
SalesAgent
PhoneAgent
WhatsAppAgent

AS SEPARATE CORES.
```

بل:

```
                    FRONTDESK AI CORE
                           │
                    AGENT RUNTIME
                           │
      ┌────────────────────┼────────────────────┐
      │                    │                    │
Business Profiles     Capabilities          Workflows
      │                    │                    │
      └────────────────────┼────────────────────┘
                           │
                      Tool Registry
                           │
                    Company Agent
                           │
                 Unified Customer Context
                           │
              ┌────────────┼────────────┐
              │            │            │
           Phone        WhatsApp     Instagram
```

هذا هو الأساس الذي يسمح للمنصة بالتوسع من 5 فئات إلى عشرات الفئات دون إعادة بناء الـCore.

---

## 37. العلاقة مع الخطة الرئيسية

هذه الوثيقة تكمل البنود الموجودة في:

- Adaptive Business Profiles
- Capability Registry
- AI Agent
- Tool Calling
- Knowledge Base
- Multi-Tenant Architecture
- Phone / WhatsApp / Instagram
- Follow-up Engine
- Human Handoff

وأصبحت **مرجع التنفيذ التفصيلي لسلوك الـAgent Runtime**.

### قاعدة التنفيذ

عند بدء البرمجة:

1. لا تكتب Industry-specific logic داخل Core.
2. لا تنشئ Agent implementation منفصل لكل فئة.
3. لا تسمح للـLLM بالوصول المباشر إلى قاعدة البيانات.
4. لا تسمح للـLLM بتجاوز Tool Registry أو Policies.
5. اجعل القنوات Adapters فوق Agent Runtime موحد.
6. اجعل البيانات الحقيقية تأتي من مصادر موثوقة.
7. اجعل كل عملية جانبية Idempotent وقابلة للتدقيق.
8. أصلح جذور التصميم بدل إضافة ترقيعات لكل حالة جديدة.

---

## 38. ترتيب التنفيذ البرمجي المرتبط بهذه الوثيقة

```
FOUNDATION
  ↓
Tenant + Auth + RLS
  ↓
Business Type + Capability Registry
  ↓
Agent Profile
  ↓
Customer Identity + Conversations
  ↓
Unified Event Model
  ↓
Tool Registry + Authorization
  ↓
Agent Orchestrator
  ↓
Knowledge + Context Builder
  ↓
WhatsApp
  ↓
Phone
  ↓
Human Handoff
  ↓
Follow-up
  ↓
Instagram
  ↓
Analytics + Observability
```

لا يتم القفز مباشرة إلى بناء عشرات Agents قبل اكتمال Runtime الأساسي.

---

> **الخلاصة:** FrontDesk AI يبني "موظفًا ذكيًا لكل شركة" من خلال **Agent Runtime واحد + Business Type Profile + Capabilities + Tools + Workflows + Customer Context + Channel Adapters**. هذا هو النموذج الرسمي الذي يجب أن يتبع التنفيذ اللاحق.
