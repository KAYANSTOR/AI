# FrontDesk AI — Execution Roadmap

This document turns `docs/PLAN.md` into the implementation order.

## Current priority

**DONE ON MAIN (code; live DB migrations 0023–0028 still operator-applied)**
- Phase 0: baseline stabilization (CI build gate, tenant resolution contracts)
- Phase 1: activation + operational core surfaces
- Phase 2: revenue operations (leads, quotes, orders, follow-up, SLA, segments, analytics)
- Phase 3: automation engine, campaigns MVP, AI governance, integration health hub
- Phase 4: usage meters + server-side entitlements + Stripe webhook/checkout scaffolding

**OPERATOR**
- Apply packages/db/migrations 0023–0028 on production Supabase
- Set CRON_SECRET, Stripe secrets if enabling paid plans
- Channel provider smoke tests with production credentials

**NEXT (Deferred / polish)**
- Tier C1–C5 completion features
- Visual workflow editor, Stripe Customer Portal UI
- Deeper Business Agent write tools

**AFTER COMMERCIAL CORE**
- Marketplace connectors, mobile, enterprise SSO

---

## Phase 0 — Baseline stabilization

### 0.1 CI and build
- Identify every failing workflow on `main`.
- Fix root causes, not symptoms.
- Keep one canonical build/test path.
- No feature work should hide or bypass a failing gate.

### 0.2 Database
- Apply migrations from 0000 forward.
- Verify constraints, indexes and RLS.
- Verify business_type/capability provisioning.
- Verify runtime/audit/outbox tables.

### 0.3 Auth and tenant resolution
- Signup → email confirmation → callback → workspace.
- Exact organization/business/channel resolution.
- No fallback to arbitrary tenant.

### 0.4 Channel smoke tests
- phone forwarding
- WhatsApp webhook
- Instagram webhook
- SMS webhook
- outbound queue

### 0.5 Exit
CI, build and migration chain green.

---

## Phase 1 — Activation + operational core

### 1.1 Onboarding orchestrator
Implement a persistent setup state:
- account
- business
- location
- hours
- services
- channels
- AI
- knowledge
- test
- activation

The wizard must resume after logout, provider error or partial completion.

**Connect-first UX requirement:**
- Collect the existing public business number once.
- Use one customer-facing **Connect your business / Kayan Connect** journey instead of separate technical channel setup flows.
- Hide provider terminology, API keys, webhook configuration and internal IDs from the customer.
- Make WhatsApp the primary connection step when applicable.
- Offer Voice activation as an optional next step using the same existing public number and carrier call forwarding to Vapi.
- Keep Instagram/SMS optional and progressively connectable.
- A failed optional channel must never block an already connected channel.
- Connection state must be resumable and expressed as Connected / Needs attention / Optional.

Target journey:
`Signup → business details + existing number → Connect your business → WhatsApp → optional Voice → ready`

### 1.2 Business profile
- name
- logo
- locale
- timezone
- currency
- address
- industry/business type

### 1.3 Locations
- create/edit/archive
- location-specific hours later
- channel/location association
- agent/location association

### 1.4 Channels
Implement connection state machine:
`draft → verifying → connected → active`
and failure states with retry.

The channel implementation must expose a unified **Kayan Connect** surface while retaining provider-specific adapters internally. Exact tenant/channel binding, signature verification, idempotency, outbox, audit and capability/entitlement checks remain mandatory.

Connection order:
1. existing business number / business identity
2. WhatsApp primary connection
3. optional Voice activation via carrier forwarding to Vapi
4. optional Instagram/SMS and future channels

Go-live requires at least one intended verified channel; it does not require every supported channel.

### 1.5 AI activation
- agent identity
- brand voice
- instructions
- capability summary
- knowledge attachment
- playground
- go-live test

### 1.6 Customer 360 MVP
- profile
- identities
- activity timeline
- lead/conversation/appointment links
- tags

### 1.7 Inbox MVP
- priority
- assignment
- team
- status
- tags
- SLA placeholder state
- internal notes
- handoff

### 1.8 Team MVP
- members
- roles
- teams
- active/inactive

### 1.9 In-app notifications MVP
- assignment
- handoff
- high priority
- provider error

### 1.10 Exit
A brand-new business can configure and activate without database/operator intervention.

---

## Phase 2 — Revenue operations

### 2.1 Leads pipeline
Add:
- stage transitions
- lead owner
- source/channel
- qualification fields
- next action

### 2.2 Quotes
- draft
- totals calculated server-side
- approval
- send
- customer decision
- expiration

### 2.3 Orders
- draft
- confirmation
- status
- cancellation
- fulfillment state

### 2.4 Follow-up runtime
- sequence definitions
- enrollments
- wait
- next step
- stop/exit
- idempotency
- retries

### 2.5 Appointment operations
- reminders
- reschedule/cancel
- staff-facing changes
- holiday-aware availability

### 2.6 Segments
- saved criteria
- tag rules
- activity-based segments

### 2.7 SLA
- first response
- resolution
- warning
- breach
- escalation

### 2.8 Core analytics
- leads
- conversations
- appointments
- quotes
- orders
- follow-up
- SLA

### 2.9 Exit
A complete inbound customer journey reaches a measurable business outcome.

---

## Phase 3 — Automation + growth

### 3.1 Automation MVP
Build a workflow definition and execution engine.

Required nodes:
- Trigger
- Action
- Condition
- Wait
- Assign
- Notify
- Handoff
- Stop

### 3.2 LOOP node
Implement only bounded loops.

Supported:
- for-each over a bounded result
- repeat-until with explicit condition

Runtime protections:
- max iterations
- max execution time
- idempotency per item/iteration
- audit per iteration
- partial failure handling
- explicit stop

### 3.3 Workflow lifecycle
`draft → tested → published → retired`

Published versions immutable.

### 3.4 Campaigns
- segment
- audience preview
- consent filter
- template
- schedule
- rate limit
- delivery status
- replies
- conversion

### 3.5 Advanced AI governance
- reply confidence
- approval queue
- sensitive-topic escalation
- PII guardrails
- prohibited claims

### 3.6 Integration Hub MVP
- provider registry
- credentials metadata
- connection status
- verification
- health
- webhook/outbox mapping

### 3.7 Exit
A non-developer admin can create and publish a safe automated workflow.

---

## Phase 4 — Commercial intelligence

### 4.1 Analytics
- management overview
- channel analytics
- AI analytics
- team analytics
- SLA analytics
- conversion analytics

### 4.2 Reports
- filters
- exports
- saved reports
- scheduled reports

### 4.3 Business Agent
- internal questions
- read tools
- governed write tools
- confirmation
- audit

### 4.4 Usage
Define meters:
- AI usage
- voice minutes
- channels
- automation runs
- campaign sends

### 4.5 Plans
- trial
- active
- past_due
- grace
- suspended
- cancelled

### 4.6 Entitlements
Enforce limits server-side.

### 4.7 Exit
Paid plan behavior is reliable and observable.

# UX FastPath — critical post-core pass

This is a product-critical simplification pass. It does not add another provider architecture or another setup system. It removes friction from the existing product.

## U.1 Fix production blockers that damage UX
- Resolve the current production channel verification constraint error before redesigning channel UX.
- Resolve missing channel credential metadata RPC/schema mismatch.
- Resolve the knowledge page runtime type error.
- Resolve the missing audit RPC/schema mismatch.
- Verify the latest production deployment has no new runtime errors on the primary customer path.

## U.2 Replace the 11-step onboarding
Target four user-centered stages:
1. ابدأ — company name, business type, existing number.
2. وصّل نشاطك — WhatsApp primary connection; Voice optional.
3. جهّز الوكيل — one ordinary-language business description; generate safe starter configuration.
4. جرّب ثم شغّل — test and Go Live.

Rules:
- Do not deep-link the user into unrelated dashboard pages during normal setup.
- Autosave setup state.
- Resume exactly after logout, refresh, email confirmation or provider failure.
- Optional setup never blocks the primary path.
- One dominant CTA per stage.

## U.3 Simplify channel connection
- Make Kayan Connect the only customer-facing connection surface.
- WhatsApp uses provider authentication/connection instead of manual IDs.
- Voice uses the existing public number with a guided call-forwarding flow to Vapi.
- Hide provider/account IDs from the normal customer path.
- Put advanced provider diagnostics behind an explicit advanced section.
- Verify connection automatically and give one actionable recovery action when verification fails.

## U.4 Make AI setup one-screen simple
- Start with a safe business-type template.
- Accept ordinary-language business description and service information.
- Generate only controlled draft configuration.
- Never invent prices, hours, availability or policies.
- Let the customer edit the generated summary in one place.

## U.5 Redesign first-run dashboard
- New/incomplete workspaces open on readiness + next action, not empty analytics.
- Show channel connection state and the shortest path to first customer interaction.
- Reveal advanced metrics only after real activity exists.

## U.6 Reduce navigation
Collapse the visible navigation to: الرئيسية, المحادثات, العملاء, المواعيد/الطلبات, الذكاء الاصطناعي, المزيد.
Move low-frequency areas such as reports, billing, integrations, workflow administration and detailed settings under contextual or More navigation.

## U.7 Error and support UX
- Never show raw SQL/PostgREST/provider messages to customers.
- Every error has a plain-language explanation plus one next action.
- Keep technical diagnostics in logs/admin surfaces.

## U.8 Speed and mobile
- Do not block the main screen on non-critical data.
- Use skeleton/loading states for secondary sections.
- Preserve entered data across transient failures.
- Keep activation one-column, touch-friendly and short on mobile.

## U.9 Exit criteria
- First-time user can identify the next step without external explanation.
- No normal setup step asks for provider IDs.
- Setup can be completed without hopping between dashboard modules.
- One verified intended channel is enough to start.
- Provider failures are recoverable from the same screen.
- New workspaces have a clear next action rather than empty-state exploration.
- Production runtime errors on the golden path are zero before release.

---

# Deferred completion backlog

## Tier C1 — Strong enhancements
- saved inbox views
- advanced search
- mentions
- canned replies/templates
- scheduled outbound
- richer customer fields
- custom statuses
- escalation policies
- exports
- API keys

## Tier C2 — Advanced AI/automation
- reusable subflows
- workflow debugger/simulator
- A/B tests
- AI confidence routing
- evaluation suite
- automatic lead scoring
- anomaly detection
- recommendation engine

## Tier C3 — Knowledge/media
- website crawler
- PDF/document ingestion
- structured catalog ingestion
- Vision/image understanding
- attachment extraction

## Tier C4 — Ecosystem
- Messenger
- Telegram
- TikTok
- email
- web chat
- CRM connectors
- ecommerce connectors
- calendar connectors
- public API
- integration marketplace

## Tier C5 — Mobile/enterprise
- native mobile app
- push
- offline mobile inbox
- enterprise SSO
- retention policies
- advanced BI
- regional/data residency
- enterprise deployment controls

---

# Vertical-slice rule

Do not implement a feature as isolated UI.

For each item:

`DB → authorization → server action/API → runtime → failure path → audit/usage → test → UI → CI`

A feature that stops at UI is incomplete.

# Change-control rule

When a new idea appears:
1. classify it as Core, Growth, or Deferred.
2. check dependencies.
3. add it to this roadmap if it changes execution order.
4. update `docs/PLAN.md` only when it becomes canonical.
5. add an ADR for architecture-changing decisions.

# Release rule

Keep `main` releasable. Use coherent commits. Do not create new branches unless explicitly approved.
