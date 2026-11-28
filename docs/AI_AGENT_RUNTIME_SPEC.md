# AI Agent Runtime — Operational Specification

Pipeline:
Ingress → Auth → Idempotency → Exact Tenant → Verified Identity / Owner / Ignore Classification → Scope-specific conversation and context → Eligibility → Agent → Tool Policy → Confirmation (before sensitive effects) → Tool Execution → Verify → Outbound → Audit.

Required invariant: personal/ignored paths do not create commercial contacts/conversations or activate SLA; external personal contacts can only relay messages or coordinate contact with the owner. These are acceptance requirements, not a blanket claim of live verification. See [the sole approved plan](../KAYAN_AI_MASTER_PLAN.md), F-003 and EXT-001–006.

External personal contacts are gated server-side by `apps/web/src/lib/runtime/external-contact-policy.ts` before any pending action, tool, eligibility, quota or model call: out-of-scope requests get a fixed refusal, mixed requests get only the communication portion, messages about the owner's own app/website (a problem, an error, or a question about signup, subscription, link or update) are treated as coordination for the owner rather than general requests, and greeting cadence is computed from scoped persisted conversation history (first contact, or after 12 hours of silence by default; override with `EXTERNAL_CONTACT_GREETING_INACTIVITY_HOURS`). The system prompt states the same rules, but the prompt is not the enforcement point.

Inbound queue retry contract: a provider event is claimed once (`webhook_events`), and `inbound_jobs.idempotency_key` is unique per event id. `apps/web/src/lib/runtime/inbound-enqueue.ts` owns the duplicate case: a `dead_letter` job is requeued so a genuine retry is not lost, while `queued`, `processing` or `completed` rows are acknowledged without a second job. Atomic claiming and stale-lock recovery stay in `claim_inbound_job` / `recover_stale_inbound_jobs`. Latency is measured locally by `apps/web/scripts/measure-ext-005-latency.ts` (synthetic fixtures, no provider network); queue wait is bounded by the worker poll interval (1500 ms) and the outbox drain interval (10 s), not by these numbers.

## WhatsApp QR channel readiness (OPS-001/OPS-002)
A `channels` row is not proof of a live WhatsApp session. The gateway holds the authoritative socket state, and the inbound route (`apps/web/src/app/api/whatsapp/qr/inbound/route.ts`) accepts a gateway-authenticated delivery only for an exact `qr_unofficial` channel that is `verification_status='verified'` **and** `is_active=true`. On `connection.open` the gateway now writes both flags and marks the state before processing any `messages.upsert` event (the socket has an `openBarrier`), so offline messages delivered immediately after a reconnect cannot race a `pending` channel into a 404 `channel_unavailable`. A gateway forward to the app retries only transient failures (404 readiness, 408/425/429, 5xx, network) at most five times over ~3.75 s; the app deduplicates by provider event id, so retries never create a second job and an accepted WhatsApp message is not dropped by a momentary binding mismatch.

Startup restore uses `apps/whatsapp-gateway/src/restore-policy.js`: a live socket is never overwritten; credentials that are missing, undecryptable or not `registered` are not restored. Instead the session row is reconciled to `failed` and the channel to `is_active=false, verification_status='failed'`, preserving both the credential blob and `whatsapp_gateway_auth_keys` for a later explicit pairing. Reconciliation covers inactive channels too, so a stale `connected` status cannot survive a skipped restore, and `GET /sessions/:id/status` reports `connected` only while the gateway holds a live connected socket. The dashboard QR card mirrors that rule instead of treating the existence of a row as connected.

## Duplicate inbound storage (OPS-003)
`ux_messages_external` is `(conversation_id, external_message_id) WHERE external_message_id IS NOT NULL`. When a redelivered job reaches `storeInboundMessage` after the inbound row was already committed, the existing row is read instead of inserting again. The turn then decides from a durable reply intent (`outbox_events` idempotency key `<eventId>:reply`): an existing intent means the turn already ran, so no model call, quota reservation, reply or send happens again (`duplicate_suppressed`); if no intent exists and the job is a retry (`attempts > 1`), the turn resumes from the stored message (`duplicate_resumed`) rather than dropping it. A first attempt that sees an unexpected duplicate is suppressed, never replayed blindly.

Outbound sends write `provider_attempted_at` immediately before the provider call. A stale `processing` row with that timestamp has an unknown provider outcome and is moved to terminal `unconfirmed` with an audit event (`outbox.delivery_unconfirmed`) instead of being resent; only rows that never reached the provider are retried. A row is marked `sent` only after the provider accepted it. Drain results separate `sent`, `cancelled`, `blocked`, `unconfirmed` and `retried`, so `processed: 2, sent: 0` is no longer ambiguous.

## Platform billing catalogue (OPS-004)
`billing_payment_providers` is platform configuration: migration 0074 enables RLS, revokes all privileges from `anon`/`authenticated` and grants only `service_role`, because `configuration` may contain provider credentials. The tenant dashboard therefore reads only `code, display_name, provider_type, is_active` through the admin client (`apps/web/src/lib/billing/payment-providers.ts`), and admin/owner responses redact credential-bearing configuration values while keeping the key names visible. No table-wide grant to `authenticated` was added.

## Owner console storage (OPS-006)
The owner console reads PostgreSQL through `DATABASE_URL` (`platformDataService.ts`, `security/auth.ts`) with `application_name=kayan-owner-console`; it has no SQLite dependency and no code path reads the `/data` volume. `start-with-gateway.mjs` maps `OWNER_CONSOLE_CREDENTIAL_ENCRYPTION_KEY`, `OWNER_CONSOLE_OWNER_EMAIL` and `OWNER_CONSOLE_OWNER_PASSCODE` into the child process, and the service also accepts the direct equivalents. Both names are supported, so the mapping is not dead configuration and nothing was deleted.

## Streaming response diagnosis (OPS-005)
`/dashboard/assistant/tasks` is a dynamic server component that renders synchronously and hands off to a client panel calling `/api/assistant/tasks`; no route in that path constructs a `ReadableStream` or writes to a response after render. The reported `The destination stream closed early` is emitted by the Next.js flight stream when the requester disconnects mid-response (navigation/refresh), not by an application stream writer. There is no silent catch around it; classification is based on the route shape and the single-occurrence pattern, and it should be re-opened as a defect if it recurs with `reqId` evidence of a server-side exception or a slow synchronous render.

## Inbound operational metrics (OPS-007)
The worker writes measured phases to `inbound_jobs` and emits one `inbound_job_metrics` JSON line keyed by the job UUID (safe correlation; no phone, message text or credentials):
`queue_wait_ms` (created_at → worker start), `processing_duration_ms` (worker turn), `model_duration_ms` (agent runner only), `outbound_duration_ms` (delivery attempt), `delivery_status`, `retry_count` and `deduplication_result` (`unique`, `duplicate_suppressed`, `duplicate_resumed`). Unmeasured database round trips are reported as SQL/PostgREST time, not fabricated. `apps/web/scripts/measure-ext-005-latency.ts` remains the synthetic baseline; `apps/web/scripts/report-inbound-metrics.ts` produces operational p50/p95 from `inbound_jobs` for the selected window, and `apps/web/src/lib/runtime/metrics.ts` is the shared nearest-rank helper. Synthetic and operational numbers must never be presented as interchangeable.

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
