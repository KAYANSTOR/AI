# Scheduled Workers

Background jobs are exposed as authenticated HTTP endpoints under `/api/cron/*`:

| Endpoint | Purpose |
|---|---|
| `/api/cron/outbox` | Delivers queued outbound messages |
| `/api/cron/followup` | Sends lead follow-ups |
| `/api/cron/sla` | Refreshes response-time SLAs |
| `/api/cron/quotes-expire` | Expires overdue quotes |
| `/api/cron/appointment-reminders` | Sends appointment reminders |
| `/api/cron/workflows` | Runs automation workflows |
| `/api/cron/campaigns` | Processes campaigns |

## Authentication

Every request must send `Authorization: Bearer $CRON_SECRET`. The secret must be at least 32 characters (`openssl rand -hex 32`). The value is compared in constant time; a missing, short or wrong secret returns `401`.

## Scheduling

Two options are supported:

1. **Railway Cron service** (recommended): create a small service in the same Railway project with a cron schedule such as `*/2 * * * *` and the start command

   ```sh
   for p in outbox followup sla quotes-expire appointment-reminders workflows campaigns; do
     curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/$p"; done
   ```

   with `APP_URL` and `CRON_SECRET` set as service variables.

2. **GitHub Actions**: `.github/workflows/outbox-cron.yml` runs every five minutes once the repository variable `APP_URL` and the secret `CRON_SECRET` are set. GitHub may delay scheduled runs, so treat it as a baseline.

## Concurrency

The outbox worker claims each event with a conditional update that only succeeds while the event is still claimable, so overlapping invocations never process the same event twice. Locks older than five minutes are reclaimable, so one invocation should finish within that window.
