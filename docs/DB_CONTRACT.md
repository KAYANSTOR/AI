# Database Contract

## Hierarchy
Organization → Business → Location → Channel → Agent.

## Runtime tables
businesses, business_locations, channels, ai_agents, agent_prompt_versions, agent_tool_policies, pending_actions, conversations, messages, webhook_events, outbox_events, agent_runs, tool_executions, audit_events, consents, usage_ledger, billing_entitlements.

## Canonical channel bindings
- Phone: channel_type=phone + provider_account_id=Vapi phone number ID.
- WhatsApp: provider_account_id=phone_number_id.
- Instagram: provider_account_id=account ID.
- SMS: external_identifier=Twilio To number.
- Telegram: channel_type=telegram; bot token and webhook secret belong in encrypted provider_credentials, never in channel identifiers.
- Facebook Messenger: channel_type=messenger; Page identity is a provider account binding and Page access token belongs in encrypted provider_credentials.
- Website chat: channel_type=website; public widget key is an identifier, while its signing secret belongs in encrypted provider_credentials.

## WhatsApp connection modes
- cloud_api: official Meta WhatsApp Cloud API.
- coexistence: official Meta-supported WhatsApp Business App + Cloud API flow, only when Meta confirms eligibility.
- qr_unofficial: separate, explicitly unofficial WhatsApp Web session. It must never be represented as Meta-approved or merged with Cloud API/Coexistence credentials.

## Migration and Railway deployment
- Database changes are applied by the repository migration runner: `npm run db:migrate` (`packages/db/scripts/migrate.mjs`).
- Railway production currently runs this command as its pre-deploy command. The migration is applied only when a deployment containing the migration is deployed; committing to a Git branch alone does not change the live schema.
- The migration runner requires sequential four-digit migration versions and rejects edits to already-applied checksums. Add a new forward-only migration for every schema change.

## Tenant and lifecycle invariants
- Every channel is scoped by organization_id; provider credentials are scoped to the owning channel and organization.
- Provider tokens, webhook secrets, and session material are encrypted using CredentialService. Never place secrets in external_identifier, provider_account_id, or public metadata.
- A channel remains pending until provider authorization, webhook/session setup, credential persistence, and real inbound/outbound checks succeed.
- Adding a channel type to the schema does not make its provider integration operational.
- Website widget origins must be explicitly allowlisted; public keys are not authentication secrets.
- Inbound provider event IDs must be persisted for idempotent processing.

Appointments use starts_at and ends_at. Existing organization_id remains the tenant guard on legacy operational tables.
