import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  BACKLOG_THRESHOLDS,
  captureException,
  evaluateBacklog,
  logEvent,
  parseSentryDsn,
  recordCriticalError,
  redactFields,
  sentryConfigured,
} from '@/lib/observability/logger'
import { createFakeDb } from './support/fake-db'

describe('structured logging', () => {
  test('redacts secrets and truncates long values', () => {
    const fields = redactFields({
      password: 'hunter2',
      access_token: 'abc',
      authorization: 'Bearer x',
      apiKey: 'k',
      safe: 'x'.repeat(900),
      error: new Error('boom'),
    })
    expect(fields.password).toBe('[redacted]')
    expect(fields.access_token).toBe('[redacted]')
    expect(fields.authorization).toBe('[redacted]')
    expect(fields.apiKey).toBe('[redacted]')
    expect(String(fields.safe).length).toBe(500)
    expect(fields.error).toEqual({ name: 'Error', message: 'boom' })
  })

  test('emits one JSON line per event', () => {
    const lines: string[] = []
    const original = console.log
    console.log = (line: string) => { lines.push(String(line)) }
    try {
      logEvent('info', 'unit.test', { organization_id: 'org-1', token: 'secret' })
    } finally {
      console.log = original
    }
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>
    expect(parsed).toMatchObject({ level: 'info', event: 'unit.test', organization_id: 'org-1', token: '[redacted]' })
    expect(typeof parsed.ts).toBe('string')
  })
})

describe('Sentry forwarding', () => {
  test('parses a standard DSN and ignores empty/malformed values', () => {
    expect(parseSentryDsn('https://public-key@sentry.example.com/42')).toEqual({
      storeUrl: 'https://sentry.example.com/api/42/store/',
      publicKey: 'public-key',
      projectId: '42',
    })
    expect(parseSentryDsn('')).toBeNull()
    expect(parseSentryDsn('not-a-url')).toBeNull()
    expect(sentryConfigured({ SENTRY_DSN: 'https://k@h.example.com/1' })).toBe(true)
    expect(sentryConfigured({})).toBe(false)
  })

  test('sends one authenticated event when configured and never throws on failure', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    const sent = await captureException(new Error('boom'), {
      event: 'unit.capture',
      env: { SENTRY_DSN: 'https://public-key@sentry.example.com/42' },
      fetchImpl,
      tags: { area: 'tests' },
    })
    expect(sent).toBe(true)
    expect(calls[0].url).toBe('https://sentry.example.com/api/42/store/')
    const header = (calls[0].init.headers as Record<string, string>)['X-Sentry-Auth']
    expect(header).toContain('sentry_key=public-key')
    const body = JSON.parse(String(calls[0].init.body)) as { message: string; tags: Record<string, string> }
    expect(body.message).toContain('unit.capture')
    expect(body.tags.area).toBe('tests')

    const failingFetch = (async () => { throw new Error('network') }) as unknown as typeof fetch
    expect(await captureException(new Error('x'), { env: { SENTRY_DSN: 'https://k@s.example.com/1' }, fetchImpl: failingFetch })).toBe(false)
    expect(await captureException(new Error('x'), { env: {} })).toBe(false)
  })
})

describe('owner-console critical errors', () => {
  test('writes a durable platform audit row without leaking details', async () => {
    const fake = createFakeDb({ platform_audit_logs: { rows: [] } })
    await recordCriticalError(fake.client as unknown as DbClient, {
      event: 'observability.backlog',
      message: 'تراكم عمليات فاشلة',
      organizationId: 'org-1',
      detail: { failedOutboxEvents: 30, token: 'should-not-leak' },
    })
    const row = fake.store.platform_audit_logs.rows?.[0]
    expect(row).toMatchObject({
      actor_email: 'system@kayan.ai',
      actor_role: 'system',
      action: 'observability.critical_error',
      entity_id: 'org-1',
    })
    expect(JSON.stringify(row)).not.toContain('should-not-leak')
  })
})

describe('backlog alerts', () => {
  test('healthy counters raise no alert', () => {
    const result = evaluateBacklog({
      failedWebhookEvents: 0,
      staleWebhookEvents: 0,
      failedOutboxEvents: 0,
      deadLetterOutboxEvents: 0,
    })
    expect(result).toEqual({
      alert: false,
      severity: 'ok',
      reasons: [],
      snapshot: {
        failedWebhookEvents: 0,
        staleWebhookEvents: 0,
        failedOutboxEvents: 0,
        deadLetterOutboxEvents: 0,
      },
    })
  })

  test('dead letters and stale webhook claims are critical', () => {
    const result = evaluateBacklog({
      failedWebhookEvents: 0,
      staleWebhookEvents: BACKLOG_THRESHOLDS.staleWebhookEvents,
      failedOutboxEvents: 0,
      deadLetterOutboxEvents: 0,
    })
    expect(result.alert).toBe(true)
    expect(result.severity).toBe('critical')
    expect(result.reasons).toContain('webhook_stale_claims')
  })

  test('a growing failed outbox is a warning', () => {
    const result = evaluateBacklog({
      failedWebhookEvents: 0,
      staleWebhookEvents: 0,
      failedOutboxEvents: BACKLOG_THRESHOLDS.failedOutboxEvents,
      deadLetterOutboxEvents: 0,
    })
    expect(result.severity).toBe('warning')
    expect(result.reasons).toEqual(['outbox_failed_backlog'])
  })
})
