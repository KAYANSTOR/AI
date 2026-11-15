# AI Agent Runtime — Operational Specification

Pipeline:
Ingress → Auth → Idempotency → Exact Tenant → Identity → Conversation → Context → Eligibility → Agent → Tool Policy → Tool Execution → Confirmation → Outbound → Audit.

## Authority
LLM = reasoning/drafting.
Capability Registry = enabled business features.
Agent Tool Policy = allow/deny + confirmation.
Tool Executor = backend validation and side effects.
Database/provider = source of truth.

## Exact tenant keys
Vapi phone number ID.
WhatsApp phone_number_id.
Instagram account ID.
SMS destination number.
There is no first-organization fallback.

## Tool execution
Registry → capability → agent policy → backend validation → confirmation when required → side effect → recorded result.

## Confirmation
pending_actions is server state. A model tool request is not confirmation. A later explicit customer affirmation executes the stored action once.

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
Duplicate event is acknowledged without reprocessing.
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
