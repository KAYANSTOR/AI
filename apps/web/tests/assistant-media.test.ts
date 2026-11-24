import { describe, expect, it } from 'bun:test'
import { aiGuardPolicyFor } from '@/lib/billing/free-tier'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import type { InboundAiGuards } from '@/lib/runtime/process-inbound'
import { fromWebUpload } from '@/lib/media/attachment'
import { guardAssistantText, runAssistantMediaTurn } from '@/lib/personal-assistant/web-media'
import type { DbClient } from '@/lib/db/client'

const trial = PLAN_CATALOG.find((p) => p.code === 'trial')!
const growth = PLAN_CATALOG.find((p) => p.code === 'growth')!
const FREE = aiGuardPolicyFor('trial', trial.limits)
const PAID = aiGuardPolicyFor('growth', growth.limits)
const owner = { organizationId: '0a000000-0000-4000-8000-000000000001', userId: 'a0000000-0000-4000-8000-00000000000a' }
const db = {} as DbClient

function oggOpus(seconds: number): Buffer {
  const head = Buffer.alloc(47)
  head.write('OggS', 0)
  head.writeBigUInt64LE(BigInt(seconds * 48000), 6)
  head.writeUInt8(1, 26); head.writeUInt8(19, 27)
  head.write('OpusHead', 28)
  head.writeUInt8(1, 36); head.writeUInt16LE(312, 38); head.writeUInt32LE(48000, 40)
  return head
}

function guards(counter: { ai: number; media: number; flood: number }, limits = { ai: 40, daily: 10, media: 5, flood: 4 }): InboundAiGuards {
  return {
    policy: async () => FREE,
    fingerprints: async () => ['f'.repeat(64)],
    consumeQuota: async (_db, input) => {
      if (input.kind === 'media') { counter.media += 1; return counter.media <= limits.media ? { allowed: true } : { allowed: false, reason: 'media' } }
      counter.ai += 1
      if (counter.ai > limits.daily) return { allowed: false, reason: 'daily' }
      return { allowed: true }
    },
    consumeFlood: async () => { counter.flood += 1; return counter.flood <= limits.flood },
    coalesceMs: 0,
  }
}

const analyzer = {
  transcribe: async () => 'أريد حجز موعد غداً',
  describeImage: async () => 'فاتورة كهرباء',
  readDocument: async () => 'نص الملف',
}

describe('personal assistant web media + text guard', () => {
  it('transcribes a recorded voice note and runs the turn with the transcript', async () => {
    const counter = { ai: 0, media: 0, flood: 0 }
    const seen: string[] = []
    const attachment = fromWebUpload({ name: 'voice.ogg', type: 'audio/ogg', size: 47 }, oggOpus(12), null, true)
    const result = await runAssistantMediaTurn(db, owner, attachment, {
      policy: FREE, guards: guards(counter), analyzer, runTurn: async (text) => { seen.push(text); return 'تم' },
    })
    expect(result.status).toBe('replied')
    expect(result.reply).toBe('تم')
    expect(result.content).toBe('أريد حجز موعد غداً')
    expect(seen[0]?.includes('أريد حجز موعد غداً')).toBe(true)
    expect(counter.media).toBe(1)
    expect(counter.ai).toBe(1)
  })

  it('rejects a 40 s voice note on the free plan without calling the model', async () => {
    let called = false
    const attachment = fromWebUpload({ name: 'voice.ogg', type: 'audio/ogg', size: 47 }, oggOpus(40), null, true)
    const result = await runAssistantMediaTurn(db, owner, attachment, {
      policy: FREE, guards: guards({ ai: 0, media: 0, flood: 0 }), analyzer, runTurn: async () => { called = true; return '' },
    })
    expect(result.status).toBe('too_long')
    expect(called).toBe(false)
  })

  it('blocks PDF analysis on free with the fixed reply and allows it on paid', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj')
    const free = await runAssistantMediaTurn(db, owner, fromWebUpload({ name: 'a.pdf', type: 'application/pdf', size: pdf.length }, pdf), {
      policy: FREE, guards: guards({ ai: 0, media: 0, flood: 0 }), analyzer, runTurn: async () => 'x',
    })
    expect(free.status).toBe('documents_not_in_plan')
    const paid = await runAssistantMediaTurn(db, owner, fromWebUpload({ name: 'a.pdf', type: 'application/pdf', size: pdf.length }, pdf), {
      policy: PAID, guards: guards({ ai: 0, media: 0, flood: 0 }), analyzer, runTurn: async (text) => (text.includes('UNTRUSTED_DATA') ? 'ok' : 'bad'),
    })
    expect(paid.reply).toBe('ok')
  })

  it('hard-rejects an .exe upload with no AI call', async () => {
    let called = false
    const exe = Buffer.from('MZ\x90\x00')
    const result = await runAssistantMediaTurn(db, owner, fromWebUpload({ name: 'setup.exe', type: 'application/octet-stream', size: 4 }, exe), {
      policy: PAID, guards: guards({ ai: 0, media: 0, flood: 0 }), analyzer: { ...analyzer, transcribe: async () => { called = true; return '' } }, runTurn: async () => { called = true; return '' },
    })
    expect(result.status).toBe('blocked_type')
    expect(called).toBe(false)
  })

  it('applies the free daily cap (10) and the 4/min flood limit to text turns', async () => {
    const counter = { ai: 0, media: 0, flood: 0 }
    const g = guards(counter, { ai: 40, daily: 10, media: 5, flood: 100 })
    const results = []
    for (let i = 0; i < 11; i += 1) results.push(await guardAssistantText(db, owner, 'مرحبا', { policy: FREE, guards: g }))
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true)
    const last = results[10]
    expect(last?.ok).toBe(false)
    expect(last && !last.ok ? [last.status, last.error, Boolean(last.reply)] : null).toEqual([429, 'free_quota_daily', true])

    const flood = guards({ ai: 0, media: 0, flood: 0 })
    const burst = []
    for (let i = 0; i < 5; i += 1) burst.push(await guardAssistantText(db, owner, 'x', { policy: PAID, guards: flood }))
    expect(burst[4]).toEqual({ ok: false, status: 429, error: 'rate_limited' })
  })

  it('truncates text to 500 chars on free and 2000 on paid', async () => {
    const long = 'أ'.repeat(3000)
    const free = await guardAssistantText(db, owner, long, { policy: FREE, guards: guards({ ai: 0, media: 0, flood: 0 }) })
    const paid = await guardAssistantText(db, owner, long, { policy: PAID, guards: guards({ ai: 0, media: 0, flood: 0 }) })
    expect(free.ok && free.text.length).toBe(500)
    expect(paid.ok && paid.text.length).toBe(2000)
  })
})
