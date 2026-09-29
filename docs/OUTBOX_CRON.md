# Outbox Worker Scheduling

The outbox worker is available at `GET|POST /api/cron/outbox`. The Vercel app configuration in `apps/web/vercel.json` intentionally has no scheduled cron; use an external scheduler instead.

## Authentication and environment

Send the secret in the `Authorization` header as `Bearer $CRON_SECRET`. The secret must be at least 32 characters long. The endpoint compares the complete bearer value in constant time and returns `401` with `{"error":"unauthorized"}` when the secret is missing, too short, or does not match.

Generate a strong secret locally:

```sh
openssl rand -hex 32
```

The worker requires these Vercel Production environment variables:

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Authenticates scheduler requests |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by the admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service-role key used by the admin client |

Outbound provider credentials are resolved for each channel by the existing credential service; they are not additional worker environment variables.

## Schedule options

The intended target cadence is once per minute. GitHub Actions scheduled workflows have a five-minute minimum interval and may start later than scheduled, so the repository workflow at `.github/workflows/outbox-cron.yml` is a five-minute baseline, not a one-minute latency guarantee. For one-minute scheduling, configure an external scheduler such as cron-job.org or Supabase `pg_cron` with `pg_net` to call the same URL and header.

The worker selects eligible events, then claims each with a conditional update that only succeeds while its status and lock timestamp remain claimable. Concurrent invocations therefore cannot both claim the same event while its five-minute lock is active. Stale processing locks are intentionally reclaimable after five minutes, so a single invocation should normally finish within that window.

## GitHub Actions setup

1. Set `CRON_SECRET` in the Vercel **Production** environment, alongside the required Supabase variables above, and redeploy.
2. Add a GitHub repository secret named `CRON_SECRET` with the same value.
3. Optionally add the repository variable `OUTBOX_CRON_URL` to override the default `https://frontdesk-ai-eosin.vercel.app/api/cron/outbox`.
4. Open **Actions → outbox-cron → Run workflow** once to verify the setup.

The workflow sends a `POST` request. A successful request returns JSON in the form `{"processed": n, "sent": m}`.

## Manual request

```sh
export CRON_SECRET='the-same-secret-configured-in-production'
export OUTBOX_CRON_URL='https://frontdesk-ai-eosin.vercel.app/api/cron/outbox'

curl --fail-with-body -sS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$OUTBOX_CRON_URL"
```

## Supabase `pg_cron` and `pg_net`

Enable `pg_cron` and `pg_net`, then store the production secret in Supabase Vault under the name `outbox_cron_secret`. The scheduled SQL reads the decrypted value from Vault when it runs; the secret itself is not embedded in the SQL:

```sql
select cron.schedule(
  'outbox-worker',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://frontdesk-ai-eosin.vercel.app/api/cron/outbox',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'outbox_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Remove or replace the scheduled job through `cron.unschedule` when changing schedulers. The worker's conditional event claim protects against ordinary overlapping invocations; the five-minute stale-lock recovery still applies.
