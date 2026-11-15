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

Appointments use starts_at and ends_at. Existing organization_id remains the tenant guard on legacy operational tables.
