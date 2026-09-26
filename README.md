# FrontDesk AI 🤖

> موظف AI واحد يمثل شركتك على Phone + WhatsApp + Instagram — يعمل 24/7

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Planning](https://img.shields.io/badge/Status-Planning-yellow.svg)]()

---

## ما هو FrontDesk AI؟

منصة SaaS تمنح كل شركة صغيرة **موظف استقبال ومبيعات بالذكاء الاصطناعي** يعمل عبر:

- 📞 **الهاتف** — يرد على المكالمات الفائتة عبر Call Forwarding
- 💬 **WhatsApp** — يرد ويحجز ويتابع العملاء
- 📸 **Instagram** — يرد على DMs تلقائياً

ويقوم بكل هذا:
```
استقبال → فهم → رد → تأهيل → حجز → متابعة → استعادة العملاء
```

---

## المميزات الرئيسية

| الميزة | الوصف |
|--------|-------|
| **AI Brain موحد** | نفس الذكاء لكل القنوات |
| **Follow-up Engine** | متابعة تلقائية للعملاء الذين لم يحجزوا |
| **Lost Lead Recovery** | استعادة العملاء الضائعين خلال 30 يوماً |
| **Unified Inbox** | كل القنوات في مكان واحد |
| **Revenue Dashboard** | نُظهر الدولارات لا المحادثات |
| **Call Forwarding** | لا حاجة لشراء رقم جديد أو التواصل مع شركة الاتصالات |

---

## Tech Stack

- **Frontend/Backend:** Next.js 14 App Router + TypeScript
- **Database:** Supabase PostgreSQL + RLS
- **AI:** Vercel AI SDK (Provider-agnostic)
- **Voice:** Vapi
- **Messaging:** Meta WhatsApp Cloud API + Instagram Graph API
- **SMS:** Twilio
- **Payments:** Stripe
- **Hosting:** Vercel + Supabase Cloud

---

## هيكل المشروع

```
frontdesk-ai/
├── apps/
│   └── web/          # Next.js Application
├── packages/
│   ├── db/           # Database schema & migrations
│   └── shared/       # Shared types & utilities
├── docs/             # Documentation & Architecture
└── tools/
    └── mcp-server/   # Development tools
```

---

## خارطة الطريق (MVP — 11 أسبوع)

- [x] **التخطيط والهندسة** ← أنت هنا
- [ ] **المرحلة 1:** Foundation — Auth + DB + Business Setup (أسبوعان)
- [ ] **المرحلة 2:** AI Receptionist — Phone + WhatsApp (4 أسابيع)
- [ ] **المرحلة 3:** Follow-up Engine (أسبوعان)
- [ ] **المرحلة 4:** SaaS + Billing (3 أسابيع)

---

## التوثيق

- 📄 [الوثيقة الموحدة النهائية](docs/PLAN.md) — الخطة الكاملة للمشروع
- 🏗️ [Architecture](docs/architecture/) — تصميم النظام

---

## الـ Niche الأول

**Beauty, Health & Wellness** — Med Spa + Dental + Aesthetic Clinics + Premium Salons

---

## License

MIT © 2026 FrontDesk AI
