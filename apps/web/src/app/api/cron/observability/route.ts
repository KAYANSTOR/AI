import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import {
  captureException,
  evaluateBacklog,
  logError,
  logEvent,
  recordCriticalError,
  type BacklogSnapshot,
} from '@/lib/observability/logger'
import { publicWebhookError } from '@/lib/runtime/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STALE_WEBHOOK_MS = 15 * 60 * 1000

/**
 * Operational health check: fails loudly when webhook or outbox work piles up.
 * Writes a durable owner-console alert (platform_audit_logs) and forwards to Sentry
 * when SENTRY_DSN is set. Safe to run frequently; it only reads.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const staleBefore = new Date(Date.now() - STALE_WEBHOOK_MS).toISOString()

  try {
    const [webhookFailed, webhookStale, outboxFailed, outboxDeadLetter] = await Promise.all([
      db.from('webhook_events').select('id', { count: 'exact', head: true }).eq('processing_status', 'failed'),
      db
        .from('webhook_events')
        .select('id', { count: 'exact', head: true })
        .eq('processing_status', 'processing')
        .lt('processing_started_at', staleBefore),
      db.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      db.from('outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'dead_letter'),
    ])

    const failure = webhookFailed.error || webhookStale.error || outboxFailed.error || outboxDeadLetter.error
    if (failure) throw new Error(failure.message)

    const snapshot: BacklogSnapshot = {
      failedWebhookEvents: webhookFailed.count ?? 0,
      staleWebhookEvents: webhookStale.count ?? 0,
      failedOutboxEvents: outboxFailed.count ?? 0,
      deadLetterOutboxEvents: outboxDeadLetter.count ?? 0,
    }
    const alert = evaluateBacklog(snapshot)
    logEvent(alert.alert ? 'warn' : 'info', 'observability.backlog', {
      severity: alert.severity,
      reasons: alert.reasons,
      ...snapshot,
    })

    if (alert.alert) {
      const message = 'تراكم عمليات فاشلة: ' + alert.reasons.join(', ')
      await recordCriticalError(db, {
        event: 'observability.backlog',
        message,
        detail: snapshot,
      })
      await captureException(new Error(message), {
        event: 'observability.backlog',
        level: alert.severity === 'critical' ? 'fatal' : 'error',
        tags: { severity: alert.severity },
        extra: snapshot,
      })
    }

    return NextResponse.json({ ok: true, ...alert }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logError(error, { event: 'observability.backlog_failed' })
    return NextResponse.json({ error: publicWebhookError() }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
