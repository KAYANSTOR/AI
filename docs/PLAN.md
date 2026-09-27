# FrontDesk AI — Canonical Operational Plan

FrontDesk AI is one multi-tenant SaaS. A company selects a business type, enables capabilities and operates one Agent across Phone, SMS, WhatsApp and Instagram.

## Non-duplicated architecture
- Voice provider: Vapi only. Retell is deprecated historical material.
- Message AI: internal Agent Runtime + Anthropic Messages API.
- DB/Auth: Supabase PostgreSQL + RLS.
- Hosting: Vercel.
- Public phone: existing business number + carrier call forwarding to Vapi.
- SMS: cloud provider adapter, independent from call forwarding.
- WhatsApp/Instagram: Meta adapters.
- Tenant resolution: exact channel binding; never first organization.
- LLM: reasoning/generation only; backend controls permissions, truth and side effects.

## Ownership model
Organization → Business → Location → Channel → Agent.

Legacy operational tables retain organization_id as a tenant guard. Runtime tables use business_id where business specificity matters.

## Universal inbound pipeline
Authenticate → Idempotency → Exact Channel → Business → Customer Identity → Conversation → Persist Inbound → Eligibility → Agent → Tool Policy → Tool Execution/Confirmation → Outbound → Audit/Usage.

## Business types and capabilities
Business types provide defaults. Capabilities are explicit:
lead_capture, appointments, quotes, orders, follow_up, inbox, knowledge_base.
A new industry is configuration + workflows + tests, not a second application.

## Agent governance
Every tool has schema, capability, risk, permission, confirmation and audit behavior.
Current tools:
- get_customer: read.
- find_available_slots: read.
- create_appointment: write + confirmation.
- request_human_handoff: write + AI pause.

The model can request tools but cannot bypass backend policy.

## Confirmation and state
Sensitive writes create pending_actions. Only a later explicit customer affirmation executes the stored action. Negative input cancels; expiration prevents stale writes.

States:
new, discovery, qualifying, waiting_customer, waiting_external, action_pending, completed, human_handoff, follow_up, closed.

## Customer identity
Exact channel external ID → exact normalized phone inside tenant → create contact. No fuzzy merge.

## Channels
Phone keeps the owner's existing public number through call forwarding; the cloud call path continues after forwarding even if the owner's phone/app is offline.
SMS uses a cloud identity and does not claim control of a personal SIM.
WhatsApp uses exact phone_number_id binding.
Instagram uses exact account binding.
No webhook may auto-create a tenant or choose an arbitrary organization.

## Reliability
Webhook idempotency + outbox events + bounded retries + dead-letter.
Worker endpoint: /api/cron/outbox, protected by CRON_SECRET.

## Security
Provider signatures are verified before processing. Secrets are server-only. RLS tenant predicates are mandatory. Public authorization helpers are invoker wrappers over private security-definer functions. handle_new_user is trigger-only.

## Operational ledger
agent_runs, tool_executions, webhook_events, audit_events, usage_ledger, billing_entitlements and consents provide evidence for observability, limits, future billing and follow-up.

## Production gate
A feature is complete only when schema contract, tenant isolation, authenticated ingress, idempotency, governed tools, confirmation where required, failure handling, audit/usage, tests, and lint/build are present.
