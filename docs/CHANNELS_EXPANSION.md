# Kayan AI channel expansion

## Reference scope

The RevoplyAI reference contains these channel cards:
1. WhatsApp Business App (recommended; Meta Embedded Signup / Coexistence where eligible)
2. Telegram
3. WhatsApp Business API (Cloud API)
4. WhatsApp QR (unofficial; explicit risk disclosure)
5. Website chat
6. Facebook Messenger
7. Instagram

The companion conversation reference is a unified inbox: channel identity and phone are visible in the header, messages are rendered in a chronological thread, and the composer supports text and attachments/actions.

## Non-negotiable implementation rules

- A channel is not marked connected until its provider handshake, webhook subscription, credential persistence, and inbound/outbound routing checks succeed.
- Keep each organization's credentials and sessions isolated. Encrypt secrets at rest with the existing credential service; never store bot tokens, page tokens, QR session material, or webhook secrets in channel identifier columns.
- Route inbound messages to the existing canonical organization/contact/conversation pipeline and route outbound messages through the selected channel adapter.
- Keep channel type and connection mode explicit. Do not treat WhatsApp Cloud API, official WhatsApp Business Coexistence, and unofficial WhatsApp Web QR as interchangeable.
- WhatsApp Coexistence is only offered when Meta's configured Embedded Signup flow returns and confirms the supported business-app state. It does not make a number currently registered in WhatsApp Messenger eligible.
- QR-based WhatsApp Web automation is unofficial and can be unstable or cause account restrictions. It must be opt-in, clearly labelled unofficial, and must not be described as Meta-approved.
- Never expose a successful demo state or fake connection. Unsupported providers remain unavailable until the full provider lifecycle is implemented and verified.

## Existing repository baseline

- The channel console and server actions live under `apps/web/src/app/dashboard/channels/`.
- Channel metadata and binding checks live in `apps/web/src/lib/channels/management.ts`.
- Credential metadata is defined in `apps/web/src/lib/credentials/catalog.ts`; encrypted persistence is handled by the existing credential service.
- WhatsApp Embedded Signup and Coexistence handling already exist and must be preserved.
- The base channels schema currently includes `phone`, `whatsapp`, `instagram`, `website`, `sms`, and `email`. New provider types require a forward-only migration and matching runtime validation.
- Existing channel actions are not sufficient by themselves to implement Telegram, Messenger, website chat, or WhatsApp Web sessions. Each needs provider-specific credential handling, webhook/session lifecycle, inbound normalization, outbound delivery, status checks, and tests.

## Delivery sequence

### Phase 1 — Channel contracts and schema
- Add Telegram and Messenger as explicit channel types.
- Keep Website chat on its existing type and define its widget/public-key contract.
- Define separate WhatsApp connection modes: Cloud API, Coexistence, and unofficial QR.
- Add migrations and tenant-safe uniqueness/indexing constraints.
- Extend credential catalog and encrypted credential persistence for provider-specific secrets.

### Phase 2 — Provider lifecycles
- Telegram: validate bot token with Telegram API, register webhook with a per-channel secret, handle updates, send messages, and verify webhook ownership.
- Messenger: Meta Page authorization, page token storage, webhook subscription, page-scoped sender identity, send API, and token verification.
- Website chat: tenant-scoped public widget key, origin allowlist, secure conversation bootstrap, inbound event ingestion, and outbound replies.
- WhatsApp QR: isolate session per organization, QR pairing, reconnect/disconnect, encrypted session persistence, health state, and explicit unofficial-provider disclosure. Do not use an in-memory-only session as a production implementation.

### Phase 3 — Unified inbox
- Normalize inbound provider events into the existing conversation/message model.
- Persist provider message IDs and delivery states for idempotency.
- Route replies by conversation channel and provider-specific sender identity.
- Preserve current WhatsApp and Instagram behavior.

### Phase 4 — UX and verification
- Match the reference channel cards and clear active/available grouping.
- Add setup dialogs, accurate status, connect/disconnect, and provider-specific health checks.
- Test tenant isolation, webhook signatures/secrets, retries, duplicate events, token expiry, reconnect, and outbound delivery.
- Do not mark a provider production-ready until end-to-end tests pass against real provider test assets.

## Current blocker

The user’s current number is registered in WhatsApp Messenger. Meta's error #3441069 says it must be moved to WhatsApp Business App before the selected Meta registration flow can connect it. Do not tell the user to delete or unregister the number. First confirm the Kayan AI Meta Embedded Signup configuration supports Coexistence; then migrate the number only with a backup and explicit user choice.
