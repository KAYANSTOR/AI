# FrontDesk AI 🤖

> موظف AI واحد يمثل شركتك على Phone + WhatsApp + Instagram — يعمل 24/7

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Phase 2](https://img.shields.io/badge/Status-Phase%202-blue.svg)]()

---

## ما هو FrontDesk AI؟

منصة SaaS تمنح كل شركة صغيرة **موظف استقبال ومبيعات بالذكاء الاصطناعي** يعمل عبر:

- 📞 **الهاتف** — يرد على المكالمات الفائتة عبر Call Forwarding
- 💬 **WhatsApp** — يرد ويحجز ويتابع العملاء
- 📸 **Instagram** — يرد على DMs تلقائياً

---

## Tech Stack

- **Frontend/Backend:** Next.js App Router + TypeScript
- **Database:** Supabase PostgreSQL + RLS
- **Voice:** Vapi
- **Messaging:** Meta WhatsApp Cloud API
- **Hosting:** Vercel + Supabase Cloud

---

## هيكل المشروع

```
frontdesk-ai/
├── apps/web/          # Next.js Application
├── packages/db/       # Database schema & migrations
├── docs/              # Documentation
└── tools/             # Dev tools
```

---

## خارطة الطريق (MVP)

- [x] **التخطيط والهندسة**
- [x] **المرحلة 1:** Foundation — Auth + DB + Business Setup
- [ ] **المرحلة 2:** AI Receptionist — Phone + WhatsApp ← قيد التنفيذ
- [ ] **المرحلة 3:** Follow-up Engine
- [ ] **المرحلة 4:** SaaS + Billing

### مرحلة 2 — ما هو في الكود الآن

- `POST /api/vapi/webhook` — tool calls + dynamic system prompt + idempotency
- `GET|POST /api/whatsapp/webhook` — Meta verify + inbound messages
- AI tools: `get_customer`, `find_available_slots`, `create_appointment`, `request_human_handoff`
- Unified Inbox UI: `/dashboard/conversations`
- Env template: `apps/web/.env.example` (no secrets in repo)

---

## التوثيق

- 📄 [الوثيقة الموحدة النهائية](docs/PLAN.md)
- 📄 [FrontDesk_AI_Final_Plan.md](FrontDesk_AI_Final_Plan.md)

---

## License

MIT © 2026 FrontDesk AI
