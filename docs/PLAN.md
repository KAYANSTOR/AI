# FrontDesk AI — Canonical Product & Operational Plan

FrontDesk AI is one multi-tenant SaaS for business customer operations. A company creates one workspace, chooses a business profile, connects its existing communication channels, trains one business-aware AI Agent, and operates conversations, leads, appointments, sales workflows, follow-up and team work from one system.

This file is the canonical product plan. Implementation must follow the execution order in `docs/ROADMAP.md`. Deferred features must not be implemented ahead of the required production gates.

---

## 0. Product principles

### 0.1 One product, configurable industries
Business types are configuration + capabilities + workflows + tests, not separate applications.

Initial business types:
- weddings_events
- sales
- appointments
- home_services
- custom

### 0.2 Customer uses the business's real communication identity
The product does not require a telecom-company custom integration.

Canonical phone model:
- Existing public business number remains the customer's number.
- Carrier call forwarding sends calls to Vapi.
- The cloud call path continues even when the owner's phone/app is offline.
- SMS is a separate cloud identity and never claims control of a personal SIM.
- WhatsApp and Instagram use exact provider/account bindings.

### 0.3 AI is controlled by the backend
The LLM reasons and generates. The backend owns:
- tenant resolution
- permissions
- truth
- capability checks
- tool policy
- confirmation
- side effects
- audit
- usage
- retries

The model can request an allowed tool but cannot bypass backend policy.

### 0.4 Every customer operation is observable
Important events must produce durable evidence:
- inbound/outbound
- agent run
- tool execution
- handoff
- automation execution
- campaign delivery
- appointment/order/quote changes
- admin changes
- billing/usage events

### 0.5 No hidden side effects
Any consequential write is:
1. policy checked
2. validated
3. confirmed when required
4. executed exactly once
5. audited
6. reflected in the conversation/customer timeline

### 0.6 Production before polish
A feature is not complete because its UI exists. It is complete only after the required data contract, tenant isolation, authenticated access, idempotency, runtime integration, failure path, audit/usage behavior, tests, lint and build are present.

---

# 1. Canonical architecture

## 1.1 Ownership hierarchy

`Organization → Business → Location → Channel → Agent`

Legacy operational tables may retain `organization_id` as a tenant guard. Runtime tables use `business_id` when business specificity matters.

No code may resolve a tenant by "first organization", "first business", or any non-exact heuristic.

## 1.2 Runtime pipeline

`Authenticate → Idempotency → Exact Channel → Business → Customer Identity → Conversation → Persist Inbound → Eligibility → Agent → Tool Policy → Tool Execution/Confirmation → Outbound → Automation → Audit/Usage`

For async work:

`Inbound → Persist → Outbox → Worker → Provider → Delivery Result → Audit/Usage`

## 1.3 Provider architecture

- Hosting: Vercel
- DB/Auth: Supabase PostgreSQL + RLS
- Message AI: internal Agent Runtime + Anthropic Messages API
- Voice: Vapi only
- WhatsApp: Meta adapter
- Instagram: Meta adapter
- SMS: cloud provider adapter
- Future providers must implement the existing channel adapter contract rather than create provider-specific business logic.

---

# 2. Existing capability model

Capabilities are explicit and business types supply defaults.

Canonical capabilities:
- lead_capture
- appointments
- quotes
- orders
- follow_up
- inbox
- knowledge_base

Future capability families may be added without creating another application.

Capability rules:
- Disabled capability hides or disables its operational surface.
- Backend guards are mandatory even when UI hides a module.
- Enabling a capability may provision required defaults, policies, workflow templates and navigation.
- Disabling a capability must not delete historical records.
- Existing records remain readable according to role/tenant policy.

---

# 3. Customer 360 — required product layer

The customer is the central business object above individual conversations.

## 3.1 Customer record

A customer/contact can have:
- profile
- normalized phone
- email
- channel identities
- tags
- segments
- custom fields
- assigned owner/team
- consent status
- lead history
- conversation history
- appointments
- quotes
- orders
- follow-up enrollments
- internal notes
- activity timeline

Identity resolution remains strict:
1. exact channel external ID
2. exact normalized phone inside the same tenant
3. create new contact

No fuzzy merge.

## 3.2 Unified customer timeline

The timeline must normalize events from:
- messages
- calls
- lead events
- appointments
- quotes
- orders
- follow-ups
- assignments
- notes
- automation actions
- campaign events

The timeline is read-only evidence; staff notes remain separate from customer-visible messages.

---

# 4. Unified Inbox — required product layer

The inbox becomes the operational command center, not only a list of conversations.

## 4.1 Required conversation controls

Every conversation may carry:
- status
- priority
- assigned user
- assigned team/queue
- tags
- AI enabled/paused
- handoff reason
- SLA state
- last inbound/outbound
- unread count
- customer summary

## 4.2 Routing

Routing rules may consider:
- business
- location
- channel
- business type
- skill
- team
- user availability
- current workload
- language
- priority
- SLA risk

Assignment must be deterministic and audited.

## 4.3 Internal collaboration

Required:
- internal notes
- mentions later
- assignment changes
- handoff
- status changes
- audit trail

Internal notes never enter outbound queues.

---

# 5. Team & permissions

Build a real team layer above the existing organization membership.

## 5.1 Roles

Minimum roles:
- owner
- admin
- manager
- agent/member
- read_only

The exact authorization matrix must be explicit, not inferred from UI.

## 5.2 Teams

Support:
- Sales
- Support
- Operations
- custom teams

## 5.3 Availability

Users may have:
- working hours
- active/inactive
- out-of-office
- concurrent conversation capacity

Availability feeds routing and SLA calculations.

---

# 6. SLA engine

SLA is a separate domain from business hours.

## 6.1 SLA primitives

- first response target
- resolution target
- priority
- business-hours calendar
- warning threshold
- breach threshold
- escalation action

## 6.2 SLA states

`normal → at_risk → breached → resolved`

SLA timers pause/resume according to the configured policy.

---

# 7. Business profile and onboarding

The product must replace "discover the dashboard" onboarding with guided activation.

## 7.1 Signup

Initial signup collects:
- company name
- business type
- work email
- password

The existing metadata-based provisioning remains valid.

## 7.2 Activation wizard

After authentication:

1. Welcome
2. Business type
3. Company profile
4. Location(s)
5. Business hours
6. Services/catalog
7. Communication channels
8. AI identity and behavior
9. Knowledge sources
10. Test conversation
11. Go Live

The user always sees:
- current step
- completed steps
- remaining setup
- blocking errors
- next action

## 7.3 Activation states

`account_created → email_pending → workspace_ready → configuring → ready_for_test → ready_to_activate → active`

Partial setup is resumable.

## 7.4 Go-live gate

Activation is allowed only when:
- organization exists
- valid business profile exists
- required business hours exist
- at least one intended channel is connected and verified
- agent exists and is active
- required knowledge/configuration is valid
- smoke test passes
- no blocking provider/authentication error exists

---

# 8. Channel setup experience

The channel page remains the management surface, but onboarding orchestrates it.

### 8.0 Connect-first / one-number onboarding
The customer-facing experience must be optimized around **Connect your business**, not technical channel configuration.

Requirements:
- Collect the business's existing public phone number once during onboarding.
- Create/provision the workspace, business, location, agent and inbox foundations automatically.
- Present one unified **Kayan Connect** journey instead of separate technical setup pages.
- Start with WhatsApp as the primary connection when applicable.
- Offer Voice as a simple optional next step using the same existing public number and carrier call forwarding to Vapi.
- Keep Instagram/SMS and future channels optional and progressively connectable.
- Hide provider terminology, API keys, webhooks and internal IDs from the customer-facing flow.
- A failed optional channel must never block already-connected channels.
- Connection state must be resumable after logout, provider errors or partial completion.
- Use customer-facing states such as **Connected / Needs attention / Optional** while retaining detailed provider state internally.

Target journey:
Signup → business details + existing number → Connect your business → WhatsApp → optional Voice → ready

The backend must retain all existing provider verification, exact tenant/channel binding, signature verification, idempotency, outbox, audit, capability and entitlement controls. Simplifying the UX must never simplify or bypass runtime safeguards.

### 8.0.1 Existing number remains the identity
The customer keeps the existing public business number. No telecom-company custom integration and no requirement to obtain a new public business number. Voice continues through carrier call forwarding to the Vapi destination, so the cloud call path does not depend on the owner's phone/app being online.

### 8.0.2 Progressive activation
A business can become operational with one verified intended channel. Other supported channels are added later without rebuilding the business, agent, inbox, customer identities or conversation history. Go-live requires at least one intended verified channel, not every supported channel.

Each channel must expose:
- not connected
- credentials required
- verifying
- connected
- active/inactive
- error
- last verified
- test result

A provider connection must be tested before activation.

## 8.1 Phone activation

The phone flow is launched from the unified Connect experience, not as a separate technical setup page.

Flow:
1. reuse the existing public number already collected during onboarding
2. receive/provision the Vapi destination
3. choose the simplest supported forwarding mode
4. configure carrier forwarding externally
5. save and resume without losing onboarding state
6. verify
7. test call
8. mark active

Do not require the user to create a new public business number.

## 8.2 WhatsApp / Instagram

Flow:
Connect → authenticate provider → exact account binding → verify webhook → send/receive test → activate

For onboarding, WhatsApp is the primary connection path when applicable. Instagram remains optional and can be connected later from Kayan Connect.

No webhook may auto-create a tenant.
# 9. AI Agent product layer

The existing governed Agent Runtime remains the execution core.

The management UX expands to:
- overview
- identity
- business role
- personality
- brand voice
- instructions
- knowledge
- enabled capabilities
- tools
- confirmation rules
- handoff rules
- channel behavior
- test playground
- versions
- activation status

## 9.1 Reply governance

Add policy beyond tool governance:
- confidence threshold
- forbidden claims
- prohibited topics
- PII handling
- sensitive topics
- marketing consent rules
- approval-required replies
- escalation rules

## 9.2 AI states

Use the existing runtime states and extend only when required:
`new, discovery, qualifying, waiting_customer, waiting_external, action_pending, completed, human_handoff, follow_up, closed`

---

# 10. Knowledge system

The existing knowledge base becomes a source manager.

Supported source families:
- manual article
- FAQ
- business policy
- service/product information
- website URL
- PDF/document
- future structured catalogs

Every source tracks:
- status
- version
- source type
- sync/index status
- last indexed
- last updated
- active/inactive

The retrieval layer must enforce tenant and source permissions.

---

# 11. Business operations

## 11.1 Services / Catalog

Expand services into a structured business catalog:
- category
- name
- description
- price
- currency
- duration
- availability
- active state
- package/add-on metadata

For sales-heavy industries, catalog items may be products rather than appointments.

## 11.2 Quotes

Required flow:

`Lead/Customer → Quote Draft → Review/Approval → Send → Customer Response → Accepted/Rejected/Expired`

Quote generation may be AI-assisted, but totals and final values are backend-controlled.

## 11.3 Orders

Required flow:

`Customer → Order Draft → Validation → Confirmation → Created → Processing → Completed/Cancelled`

Orders may originate from:
- AI conversation
- staff action
- accepted quote
- future external integration

## 11.4 Appointments

Required:
- availability
- service duration
- location
- staff/resource later
- create
- reschedule
- cancel
- reminders
- holiday/date exceptions

The existing slot uniqueness and holiday-aware hours remain foundational.

---

# 12. Follow-up engine

Follow-up is more than stored steps; it needs a runtime.

## 12.1 Sequence model

A sequence contains:
- trigger
- audience/eligibility
- steps
- wait durations
- conditions
- exit conditions
- channel
- template/message strategy
- limits
- version
- active/inactive

## 12.2 Enrollment

Each customer enrollment tracks:
- current step
- status
- next run
- attempts
- exit reason
- last result

## 12.3 Safe retry

Follow-up must be idempotent. A customer cannot accidentally receive duplicate scheduled actions because of worker retries.

---

# 13. Automation Studio — major product layer

Build a general workflow engine rather than one-off hardcoded flows.

## 13.1 Trigger types

Initial:
- new message
- inbound call completed
- lead created/updated
- appointment created/updated/cancelled
- quote state changed
- order state changed
- customer tag added/removed
- scheduled time
- webhook
- follow-up event

## 13.2 Action types

Initial:
- send message
- send template
- create/update lead
- create/update customer
- create appointment
- create quote
- create order
- assign team/user
- add/remove tag
- start/stop follow-up
- request human handoff
- notify staff
- wait
- condition
- call an approved internal tool

## 13.3 Conditions

Support:
- equals/not equals
- contains
- numeric/date comparisons
- customer attributes
- business attributes
- channel
- capability
- previous action result

## 13.4 LOOP support

Loops are explicitly part of the automation model.

Allowed patterns:
- loop over a bounded audience/list
- repeat a bounded step until a condition
- process items from an approved query result

Safety:
- every loop has a maximum iteration count
- runtime enforces a hard upper bound
- each iteration has an idempotency key
- no unbounded recursive workflow execution
- a workflow may terminate early on condition
- loop failures are isolated and audited
- loop metrics record attempted/completed/failed iterations

## 13.5 Variables and execution context

A workflow has:
- input
- variables
- step outputs
- customer context
- business context
- channel context
- timestamps
- execution ID

Only approved values may cross tenant boundaries.

## 13.6 Versioning

`draft → tested → published → retired`

Published versions are immutable. New changes create a new version.

---

# 14. Campaigns & segmentation

Campaigns are a distinct product from transactional follow-up.

## 14.1 Segmentation

Segments can use:
- tags
- customer attributes
- lead status
- appointment history
- order history
- inactivity period
- source/channel
- consent

## 14.2 Campaign lifecycle

`draft → review → scheduled → running → completed → cancelled`

## 14.3 Campaign controls

- audience size preview
- deduplication
- consent checks
- rate limits
- quiet hours
- template/provider policy checks
- delivery state
- reply count
- conversion attribution

Never send a campaign merely because a customer exists.

---

# 15. Analytics & reports

The existing dashboard KPIs are only the beginning.

## 15.1 Core metrics

- conversations
- response time
- resolution time
- handoff rate
- AI automation rate
- lead volume
- lead qualification
- appointment volume
- quote volume
- order volume
- follow-up completion
- campaign delivery
- campaign response
- conversion
- channel performance
- team workload
- SLA risk/breach
- AI tool/reply outcomes

## 15.2 Views

- executive overview
- inbox operations
- leads
- customers
- appointments
- sales
- campaigns
- AI performance
- team performance
- channels
- SLA

## 15.3 Reporting

Later:
- saved filters
- exports
- scheduled reports
- custom dashboards

The first implementation should ship reliable built-in reports before a visual dashboard builder.

---

# 16. Business Agent

Add a second governed agent surface for internal staff.

## 16.1 Customer-facing agent
Handles customer communication and approved business actions.

## 16.2 Business Agent
Answers employee questions and may execute approved internal actions.

Examples:
- "كم عدد العملاء الجدد هذا الأسبوع؟"
- "اعرض الحجوزات غداً."
- "كم طلباً ما زال مفتوحاً؟"
- "أنشئ متابعة لهذا العميل."

Every Business Agent tool uses the same governance framework:
- schema
- permission
- capability
- risk
- confirmation
- audit
- tenant scoping

No direct SQL-like free-form write.

---

# 17. Integration Hub

Create a provider-neutral integration registry.

Initial categories:
- communication providers
- calendar providers
- CRM/webhooks
- spreadsheets
- public API
- notification providers

Each integration:
- has credentials
- has connection status
- has verification
- declares capabilities
- has health state
- is tenant scoped

External integrations must use adapters and outbox/idempotency rules.

---

# 18. Billing, plans and usage

Existing billing/usage foundations are preserved and completed.

## 18.1 Metered usage

Define product meters explicitly:
- AI message/processing usage
- voice minutes
- channel count
- automation runs
- campaign sends
- knowledge/storage later

Meter definitions must be versioned.

## 18.2 Subscription lifecycle

`trial → active → past_due → grace_period → suspended → cancelled`

Upgrades/downgrades never destroy historical data.

## 18.3 Entitlements

Plans control:
- number of channels
- agents
- team members
- voice limits
- automation limits
- campaign limits
- knowledge limits
- history retention later

Runtime checks entitlements before expensive/limited operations.

---

# 19. Notifications

Add an internal notification layer for:
- new high-priority conversation
- assignment
- handoff
- SLA risk/breach
- appointment changes
- quote/order events
- campaign completion
- provider failures
- billing/limit events

Delivery may later include:
- web/in-app
- email
- push

Notification creation is asynchronous and idempotent.

---

# 20. Reliability and operational controls

The current outbox model remains canonical.

Required:
- webhook idempotency
- outbox events
- bounded retries
- dead-letter
- replay tooling
- provider timeout handling
- provider circuit/health state later
- delivery status
- correlation IDs

Worker endpoint remains:
`GET|POST /api/cron/outbox`

Protected by `CRON_SECRET`.

---

# 21. Security & privacy

Required:
- provider signature verification before processing
- server-only secrets
- RLS tenant predicates
- exact channel binding
- private security-definer functions where necessary
- invoker wrappers for public authorization
- trigger-only user provisioning
- consent tracking
- audit trail
- PII minimization
- no credential values sent to client
- no tenant auto-creation from provider callbacks

For marketing/campaign traffic, consent and opt-out are blocking rules.

---

# 22. UX / design system

The established FrontDesk brand remains canonical:

- Primary: #D97757
- Dark: #B85C3E
- Light: #F3C5B5
- Background: #F7F4EF
- Surface: #FFFFFF
- Text: #292524
- Muted: #78716C
- Border: #E7E2DC
- Success: #6B8E72
- Warning: #D59A3A
- Error: #C65D5D
- Info: #64748B
- Dark: #1F1F1F

UX direction:
- clear command-center dashboard
- high information density without visual clutter
- strong status chips
- obvious next action
- empty states with guidance
- mobile-responsive operations
- RTL first for Arabic
- accessible focus/keyboard behavior
- consistent actions and confirmation patterns

The UI must communicate setup state, provider state, AI state and operational risk directly.

---

# 23. Dashboard information architecture

Target navigation:

## Home
- Overview

## Customers
- Inbox
- Contacts
- Leads
- Campaigns

## Operations
- Appointments
- Services / Catalog
- Quotes
- Orders
- Follow-ups

## AI
- AI Agent
- Knowledge
- Automations
- Business Agent

## Communications
- Channels
- Phone
- Templates

## Insights
- Analytics
- Reports

## Team
- Members
- Teams
- Routing
- Permissions

## Business
- Profile
- Locations
- Hours

## System
- Integrations
- Usage & Billing
- Settings

Navigation is capability-aware, but direct route access remains backend guarded.

---

# 24. Execution phases

## Phase 0 — Baseline stabilization
Do this before adding major product surface.

Tasks:
1. Verify `main` is the canonical base.
2. Resolve current CI/build/lint failures.
3. Verify all current migrations apply cleanly in order.
4. Verify auth callback + signup provisioning.
5. Verify exact tenant/channel resolution.
6. Verify outbox worker and retry behavior.
7. Verify current smoke tests for phone/WhatsApp/Instagram/SMS ingress.
8. Remove dead planning duplication; keep `docs/PLAN.md` canonical.
9. No new provider architecture unless justified by an explicit ADR.

Exit:
- CI green
- build green
- migration chain green
- no known tenant-isolation regression
- all current channels preserve existing behavior

## Phase 1 — Activation and operational core
Build now.

Tasks:
1. Onboarding state machine + resumable wizard.
2. Business profile editor.
3. Location management and business/location binding.
4. Business hours + date exceptions.
5. Services/catalog foundation.
6. Channel activation flow with verification/test states.
7. AI Agent setup + test playground.
8. Customer 360 timeline foundation.
9. Inbox priority/assignment/tags.
10. Basic teams/roles.
11. Internal notifications foundation.

Exit:
- a new company can sign up and reach a verified active agent without manual database work
- customer can message/call and staff can observe/route the conversation
- all activity is tenant-safe and auditable

## Phase 2 — Core revenue operations
Build immediately after Phase 1.

Tasks:
1. Leads pipeline improvements.
2. Quotes.
3. Orders.
4. Follow-up runtime.
5. Appointment reminders.
6. Customer segments/tags.
7. SLA engine.
8. Inbox routing rules.
9. Basic analytics.
10. Customer consent/opt-out UX.

Exit:
- one complete path exists from inbound lead to business outcome
- scheduled follow-ups are idempotent
- SLA and assignment are deterministic
- core operational metrics are trustworthy

## Phase 3 — Automation and growth
Build after the core operations are stable.

Tasks:
1. Automation Studio MVP.
2. Trigger/condition/action runtime.
3. Wait/state persistence.
4. Bounded LOOP node.
5. Workflow versioning.
6. Campaigns.
7. Segmentation.
8. Campaign delivery analytics.
9. Advanced AI reply governance.
10. Integration Hub MVP.

Exit:
- admins can create/publish/test a bounded workflow without code changes
- workflow execution remains governed, idempotent and auditable
- campaigns cannot bypass consent/rate limits

## Phase 4 — Commercial intelligence
Build after Phases 1–3.

Tasks:
1. Full analytics.
2. Reports.
3. Team productivity.
4. AI performance analytics.
5. Business Agent MVP.
6. Usage meters.
7. Plans/entitlements.
8. Billing lifecycle.
9. Limit handling and upgrade surfaces.

Exit:
- product supports paid plan enforcement with reliable usage evidence
- management can understand business and AI performance from the dashboard

---

# 25. Non-core / completion features

These are valuable but must not block core launch.

Implement only after the required production gates pass:

### Tier C1 — Strong enhancements
- saved inbox views
- advanced search
- mentions
- canned replies/templates
- scheduled outbound messages
- appointment reminder channels
- export CSV
- webhook management UI
- API keys
- richer customer custom fields
- custom statuses
- configurable escalation policies

### Tier C2 — Advanced automation/AI
- visual workflow builder with reusable subflows
- workflow simulation/debugger
- A/B testing
- AI confidence routing
- AI reply approval queue
- prompt/knowledge evaluation suite
- conversation summarization at scale
- automatic lead scoring
- anomaly detection
- predictive recommendations

### Tier C3 — Advanced knowledge and media
- website crawler/sync
- PDF/document ingestion UI
- structured product catalog ingestion
- image understanding / Vision
- attachment understanding
- multi-document extraction

### Tier C4 — Channels and ecosystem
- additional channels such as Messenger, Telegram, TikTok, email and web chat
- richer calendar integrations
- CRM integrations
- ecommerce integrations
- public developer API
- marketplace/integration catalog

### Tier C5 — Mobile and enterprise
- native mobile app
- push notifications
- offline mobile inbox
- advanced audit explorer
- enterprise SSO
- organization-level data retention policies
- advanced BI connectors
- regional/data residency options
- enterprise deployment controls

These features are not allowed to destabilize the core customer/channel/runtime architecture.

---

# 26. What must NOT happen

- Do not create a second application per industry.
- Do not create a second Agent Runtime.
- Do not bypass the existing governance layer for "quick" tools.
- Do not send directly from arbitrary UI code when an outbox workflow is required.
- Do not auto-create a tenant from an inbound webhook.
- Do not select the first organization/business/channel as a fallback.
- Do not add telecom-specific custom integration.
- Do not expose provider secrets to the browser.
- Do not implement unbounded workflow loops.
- Do not ship UI-only placeholders as "complete".
- Do not duplicate capability definitions across unrelated layers.
- Do not make billing limits a UI-only rule.
- Do not implement deferred features before Phase 1–4 gates are met.

---

# 27. Definition of Done

A feature is complete only if all applicable items are true:

### Product
- user story defined
- lifecycle/states defined
- empty/error/loading states defined
- mobile/RTL behavior considered

### Data
- schema contract defined
- indexes/constraints defined
- historical behavior preserved
- migration tested

### Security
- authentication
- authorization
- tenant isolation
- secret handling
- consent/privacy rules

### Runtime
- API/server action
- capability guard
- idempotency
- retry/failure behavior
- outbox where asynchronous
- audit
- usage/entitlement where applicable

### AI
- prompt/context contract
- tool governance
- confirmation policy
- reply governance where applicable
- hallucination-sensitive backend validation

### Quality
- focused tests
- regression tests
- lint
- typecheck/build
- CI green

---

# 28. Current implementation rule

Until Phase 0 is green, only fixes and foundational work are allowed.

Once Phase 0 is green, execute:
`Phase 1 → Phase 2 → Phase 3 → Phase 4`

At every phase:
1. audit current implementation
2. implement the smallest complete vertical slice
3. test
4. verify tenant isolation
5. verify runtime integration
6. verify UI
7. update documentation/ADR when an architecture decision changes
8. commit a coherent change
9. keep `main` releasable

The roadmap is executable, not a wish list.
