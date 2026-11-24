/**
 * Observability: structured logs, optional Sentry forwarding and operational backlog
 * alerts.
 *
 * Design rules:
 *  - one JSON line per event on stdout/stderr, so platform log search works;
 *  - secrets are never logged: keys are filtered and values are truncated;
 *  - Sentry is used only when SENTRY_DSN is configured and is best-effort — a failed
 *    report must never break the request that raised the error;
 *  - critical errors are also written to public.platform_audit_logs so the owner
 *    console has a durable trail, and backlog thresholds trigger an alert row.
 */
import { randomUUID } from 'node:crypto'
import type { DbClient } from '@/lib/db/client'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const FORBIDDEN_KEY_RE = /pass(word)?|secret|token|cookie|authorization|api[_-]?key|credential|ciphertext|dsn/i
const MAX_VALUE_LENGTH = 500

export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      output[key] = '[redacted]'
      continue
    }
    if (value instanceof Error) {
      output[key] = { name: value.name, message: value.message.slice(0, MAX_VALUE_LENGTH) }
      continue
    }
    if (typeof value === 'string') {
      output[key] = value.slice(0, MAX_VALUE_LENGTH)
      continue
    }
    if (value && typeof value === 'object') {
      try {
        output[key] = JSON.parse(JSON.stringify(value).slice(0, 4000))
      } catch {
        output[key] = '[unserializable]'
      }
      continue
    }
    output[key] = value
  }
  return output
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...redactFields(fields),
  })
  if (level === 'error' || level === 'fatal') console.error(line)
  else console.log(line)
}

export function logError(error: unknown, context: Record<string, unknown> = {}): void {
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message.slice(0, MAX_VALUE_LENGTH), stack: error.stack?.split('\n').slice(0, 8).join('\n') }
      : { message: String(error).slice(0, MAX_VALUE_LENGTH) }
  logEvent('error', String(context.event ?? 'unhandled_error'), { ...context, error: normalized })
}

export type SentryTarget = { storeUrl: string; publicKey: string; projectId: string }

/** Parses a standard DSN: https://<publicKey>@<host>/<projectId>. */
export function parseSentryDsn(dsn: string | null | undefined): SentryTarget | null {
  const raw = String(dsn ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!url.username) return null
    const projectId = url.pathname.replace(/^\//, '').split('/')[0]
    if (!projectId) return null
    return {
      storeUrl: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      publicKey: decodeURIComponent(url.username),
      projectId,
    }
  } catch {
    return null
  }
}

export function sentryConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return parseSentryDsn(env.SENTRY_DSN) !== null
}

type CaptureOptions = {
  event?: string
  level?: 'error' | 'fatal'
  user?: { id?: string; organizationId?: string }
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
}

/** Sends one event to Sentry when configured. Never throws. */
export async function captureException(error: unknown, options: CaptureOptions = {}): Promise<boolean> {
  const env = options.env ?? process.env
  const target = parseSentryDsn(env.SENTRY_DSN)
  if (!target) return false
  const message = error instanceof Error ? error.message : String(error)
  const event = {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: options.level ?? 'error',
    logger: 'kayan-ai',
    message: options.event ? `${options.event}: ${message}` : message,
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : 'Error',
          value: message.slice(0, 1000),
          stacktrace: error instanceof Error && error.stack ? { frames: [] } : undefined,
        },
      ],
    },
    tags: options.tags,
    extra: redactFields({ ...(options.extra ?? {}), ...(error instanceof Error && error.stack ? { stack: error.stack.slice(0, 3000) } : {}) }),
    user: options.user ? { id: options.user.id, organization_id: options.user.organizationId } : undefined,
  }
  try {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(target.storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=kayan-ai/1.0`,
      },
      body: JSON.stringify(event),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Durably records a critical error in the owner console audit trail. Actor columns are
 * required by the table; system events use a fixed system identity.
 */
export async function recordCriticalError(
  db: DbClient,
  input: { event: string; message: string; organizationId?: string | null; detail?: Record<string, unknown> }
): Promise<void> {
  try {
    await db.from('platform_audit_logs').insert({
      actor_email: 'system@kayan.ai',
      actor_role: 'system',
      action: 'observability.critical_error',
      entity_type: 'system',
      entity_id: input.organizationId ?? 'platform',
      summary: `${input.event}: ${input.message}`.slice(0, 500),
      after_json: redactFields({ ...(input.detail ?? {}), event: input.event }),
    })
  } catch {
    // Audit persistence must not mask the original failure.
  }
}

export type BacklogSnapshot = {
  failedWebhookEvents: number
  staleWebhookEvents: number
  failedOutboxEvents: number
  deadLetterOutboxEvents: number
}

export const BACKLOG_THRESHOLDS: BacklogSnapshot = {
  failedWebhookEvents: 25,
  staleWebhookEvents: 10,
  failedOutboxEvents: 25,
  deadLetterOutboxEvents: 5,
}

export type BacklogAlert = {
  alert: boolean
  severity: 'ok' | 'warning' | 'critical'
  reasons: string[]
  snapshot: BacklogSnapshot
}

/** Pure threshold evaluation so it is testable without a database. */
export function evaluateBacklog(
  snapshot: BacklogSnapshot,
  thresholds: BacklogSnapshot = BACKLOG_THRESHOLDS
): BacklogAlert {
  const reasons: string[] = []
  if (snapshot.deadLetterOutboxEvents >= thresholds.deadLetterOutboxEvents) reasons.push('outbox_dead_letter')
  if (snapshot.failedOutboxEvents >= thresholds.failedOutboxEvents) reasons.push('outbox_failed_backlog')
  if (snapshot.failedWebhookEvents >= thresholds.failedWebhookEvents) reasons.push('webhook_failed_backlog')
  if (snapshot.staleWebhookEvents >= thresholds.staleWebhookEvents) reasons.push('webhook_stale_claims')
  const severity = reasons.some((reason) => reason === 'outbox_dead_letter' || reason === 'webhook_stale_claims')
    ? 'critical'
    : reasons.length
      ? 'warning'
      : 'ok'
  return { alert: reasons.length > 0, severity, reasons, snapshot }
}
