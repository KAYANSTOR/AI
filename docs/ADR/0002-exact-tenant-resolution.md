# ADR-0002 — Exact Tenant Resolution (KAYAN AI)

Inbound events resolve only by verified, exact channel binding: WhatsApp phone_number_id or authorized QR channel/session, Instagram account ID, Messenger Page ID, or Telegram bot/channel identity, as appropriate to the implemented adapter. Validate provider signature, tenant/channel eligibility and ownership. No first-organization fallback, arbitrary tenant selection, or implicit activation of unsupported channels.

Personal owner and ignored-contact routing must precede commercial contact/conversation creation and SLA side effects. See [the sole approved plan](../../KAYAN_AI_MASTER_PLAN.md) (F-003, EXT-001–006). This is a required invariant, not a claim that all live paths have passed verification.
