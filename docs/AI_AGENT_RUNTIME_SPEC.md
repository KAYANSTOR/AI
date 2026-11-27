# AI Agent Runtime — Operational Specification

Pipeline:
Ingress → Auth → Idempotency → Exact Tenant → Verified Identity / Owner / Ignore Classification → Scope-specific conversation and context → Eligibility → Agent → Tool Policy → Confirmation (before sensitive effects) → Tool Execution → Verify → Outbound → Audit.

Required invariant: personal/ignored paths do not create commercial contacts/conversations or activate SLA; external personal contacts can only relay messages or coordinate contact with the owner. These are acceptance requirements, not a blanket claim of live verification. See [the sole approved plan](../KAYAN_AI_MASTER_PLAN.md), F-003 and EXT-001–006.

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
