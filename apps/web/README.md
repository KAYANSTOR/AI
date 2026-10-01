# FrontDesk AI Web

Next.js App Router application (TypeScript, Tailwind 4, Supabase).

## Runtime endpoints

All provider webhooks run on the Node.js runtime, verify the provider signature and resolve
the tenant by exact channel binding (never "first organization"):

- `/api/vapi/webhook` — Phone (Vapi only; resolved by Vapi phone number ID)
- `/api/whatsapp/webhook` — resolved by `phone_number_id`
- `/api/instagram/webhook` — resolved by Instagram account ID
- `/api/sms/webhook` — resolved by the Twilio `To` number
- `GET|POST /api/cron/outbox` — outbox worker (requires `Authorization: Bearer $CRON_SECRET`; scheduling and setup: [docs/OUTBOX_CRON.md](../../docs/OUTBOX_CRON.md))

Every message channel terminates in the same pipeline:
`identity → conversation → persist → consent/eligibility → agent → outbound/outbox → audit`.

## Product routes

| Route | Purpose |
|---|---|
| `/` | Public platform page |
| `/login`, `/signup` | Account access and company signup |
| `/auth/callback` | Email confirmation callback |
| `/dashboard` | Company overview |
| `/dashboard/setup` | Business type + enabled capabilities (onboarding) |
| `/dashboard/settings` | Company profile and capability manager |
| `/dashboard/conversations` · `/leads` · `/contacts` · `/appointments` · `/services` | Operational modules |

## Environment

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Session-scoped Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only client used by webhooks (never exposed to the browser) |
| `NEXT_PUBLIC_SITE_URL` | Canonical/Open Graph base URL |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Agent Runtime and Copilot access via Google AI Studio |
| `VAPI_WEBHOOK_SECRET` | Vapi webhook authentication |
| `META_APP_SECRET`, `META_GRAPH_BASE_URL`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN` | Meta channels |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS channel |
| `CRON_SECRET` | Outbox worker authentication |

`apps/web/.env.example` lists the same keys for local setup.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run build
```

## Database

Migrations live in `packages/db/migrations` and are applied in order (0000 → 0007).
They define the Organization → Business → Location → Channel → Agent hierarchy, RLS
policies, capability defaults and the operational ledger documented in
`docs/DB_CONTRACT.md`. See the repository root docs for the canonical contracts.
