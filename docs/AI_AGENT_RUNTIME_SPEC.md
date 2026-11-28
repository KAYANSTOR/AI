# AI Agent Runtime — Operational Specification

Pipeline:
Ingress → Auth → Idempotency → Exact Tenant → Verified Identity / Owner / Ignore Classification → Scope-specific conversation and context → Eligibility → Agent → Tool Policy → Confirmation (before sensitive effects) → Tool Execution → Verify → Outbound → Audit.

Required invariant: personal/ignored paths do not create commercial contacts/conversations or activate SLA; external personal contacts can only relay messages or coordinate contact with the owner. These are acceptance requirements, not a blanket claim of live verification. See [the sole approved plan](../KAYAN_AI_MASTER_PLAN.md), F-003 and EXT-001–006.

External personal contacts are gated server-side by `apps/web/src/lib/runtime/external-contact-policy.ts` before any pending action, tool, eligibility, quota or model call: out-of-scope requests get a fixed refusal, mixed requests get only the communication portion, messages about the owner's own app/website (a problem, an error, or a question about signup, subscription, link or update) are treated as coordination for the owner rather than general requests, and greeting cadence is computed from scoped persisted conversation history (first contact, or after 12 hours of silence by default; override with `EXTERNAL_CONTACT_GREETING_INACTIVITY_HOURS`). The system prompt states the same rules, but the prompt is not the enforcement point.

Inbound queue retry contract: a provider event is claimed once (`webhook_events`), and `inbound_jobs.idempotency_key` is unique per event id. `apps/web/src/lib/runtime/inbound-enqueue.ts` owns the duplicate case: a `dead_letter` job is requeued so a genuine retry is not lost, while `queued`, `processing` or `completed` rows are acknowledged without a second job. Atomic claiming and stale-lock recovery stay in `claim_inbound_job` / `recover_stale_inbound_jobs`. Latency is measured locally by `apps/web/scripts/measure-ext-005-latency.ts` (synthetic fixtures, no provider network); queue wait is bounded by the worker poll interval (1500 ms) and the outbox drain interval (10 s), not by these numbers.

## Authority
LLM = reasoning/drafting.
Capability Registry = enabled business features.
Agent Tool Policy = allow/deny + confirmation.
Tool Executor = backend validation and side effects.
Database/provider = source of truth.

## Exact tenant keys
WhatsApp phone_number_id.
Instagram account ID.
Telegram bot ID.
Messenger Page ID.
There is no first-organization fallback.

## Tool execution
Registry → capability → agent policy → backend validation → confirmation when required → side effect → recorded result.

## Confirmation
pending_actions is server state. A model tool request is not confirmation. A later explicit authorized affirmation may execute the stored action after server-side validation and atomic claim; sensitive owner actions require exact, single-use hash-bound approval, and uncertain delivery is reconciled before retry.

## State semantics
new = accepted.
discovery = collecting intent.
qualifying = collecting required facts.
waiting_customer = waiting.
action_pending = sensitive write awaiting confirmation.
completed = completed.
human_handoff = AI paused.
follow_up = enrolled.
closed = no automation.

## Failures
Invalid signature rejects.
Duplicate completed event is acknowledged without reprocessing; failed or expired claims follow bounded, safe retry and reconciliation policy, not blind replay.
Unmapped tenant is rejected.
Disabled tool is blocked.
Provider send failure is queued to outbox.
Exhausted retry becomes dead-letter.
Empty model output is failure.

## Security invariants
No provider secret exposure.
No customer prompt override of system policy.
No cross-tenant reads.
No ungoverned writes.
No false success claims.
