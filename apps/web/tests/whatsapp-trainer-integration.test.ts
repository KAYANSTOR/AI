import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { handleCentralInbound, type CentralDeps } from '@/lib/central-bot/router'
import { parseCentralMessage } from '@/lib/central-bot/parse'
import { chunkText, extractTrainingDraft } from '@/lib/trainer/extract'
import { validateMedia } from '@/lib/trainer/media'
import { createTrainerLinkCode, type TrainerDeps } from '@/lib/trainer/router'
import { createFakeDb } from './support/fake-db'

const ORG_A = '0a000000-0000-4000-8000-0000000000a1'
const USER_A = 'a0000000-0000-4000-8000-0000000000aa'
const PHONE = '967711111111'
const T0 = Date.parse('2026-11-24T09:00:00Z')

function asDb(client: unknown) { return client as unknown as DbClient }

function setup() {
  return createFakeDb({
    organizations: { rows: [{ id: ORG_A, business_type: 'store', personal_assistant_addon_enabled: true }] },
    business_profiles: { rows: [{ organization_id: ORG_A, business_type_id: 'store' }] },
    organization_members: { rows: [{ organization_id: ORG_A, user_id: USER_A, role: 'owner' }] },
    personal_assistant_links: { rows: [{ id: 'l1', org_id: ORG_A, user_id: USER_A, whatsapp_phone: `+${PHONE}`, verified_at: new Date(T0).toISOString(), kill_switch_active: false }] },
    personal_assistant_messages: { rows: [], unique: [{ columns: ['external_message_id'], where: (row) => row.external_message_id != null }] },
    agent_tasks: { rows: [] },
    agent_task_steps: { rows: [] },
    agent_approvals: { rows: [] },
    agent_receipts: { rows: [] },
    whatsapp_trainer_links: { rows: [], unique: [['org_id', 'user_id'], { columns: ['whatsapp_phone'], where: (row) => row.whatsapp_phone != null }] },
    whatsapp_training_submissions: { rows: [], unique: [{ columns: ['external_message_id'], where: (row) => row.external_message_id != null }] },
    knowledge_base: { rows: [], unique: [['organization_id', 'content_hash']] },
    user_memories: { rows: [] },
  })
}

function deps(sent: string[], trainerOverrides: Partial<TrainerDeps> = {}): CentralDeps {
  const trainer: TrainerDeps = {
    now: () => new Date(T0),
    sendText: async (_to, text) => { sent.push(text) },
    sendButtons: async (_to, text) => { sent.push(text) },
    downloadMedia: async () => ({ bytes: Buffer.from('سياسة الاستبدال: خلال 7 أيام مع الفاتورة.\n\nالشحن داخل صنعاء 1500 ريال.'), mimeType: 'text/plain' }),
    transcribe: async () => '',
    readDocument: async (media) => media.bytes.toString('utf8'),
    assertLimit: async () => undefined,
    recordUsage: async () => undefined,
    ...trainerOverrides,
  }
  return {
    now: () => new Date(T0),
    hasAccess: async () => true,
    sendText: async (_to, text) => { sent.push(text) },
    sendButtons: async (_to, text) => { sent.push(text) },
    transcribe: async () => '',
    runTurn: async () => ({ reply: 'PA reply' }),
    engine: {},
    trainer,
  }
}

describe('central bot + trainer integration', () => {
  test('«وضع التدريب» on a PA-linked owner opens the trainer, and «إيقاف فوري» still reaches the kill switch', async () => {
    const { client, store } = setup()
    const sent: string[] = []
    const d = deps(sent)
    const entered = await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'm1', type: 'text', text: 'وضع التدريب' }, d)
    expect(entered).toBe('training_started')
    expect(sent.join('\n')).toContain('مدرب كيان')

    const stop = await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'm2', type: 'text', text: 'إيقاف فوري' }, d)
    expect(stop).toBe('kill_switch_on')
    expect(store.personal_assistant_links.rows![0].kill_switch_active).toBe(true)
  })

  test('a document in training mode becomes a pending draft, never indexed before confirmation', async () => {
    const { client, store } = setup()
    const sent: string[] = []
    const d = deps(sent)
    await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'd0', type: 'text', text: 'وضع التدريب' }, d)
    const result = await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'd1', type: 'document', mediaId: 'doc-1', mimeType: 'text/plain', fileName: 'policy.txt' }, d)
    expect(result).toBe('draft_created')
    const rows = store.whatsapp_training_submissions.rows!
    expect(rows).toHaveLength(1)
    expect(rows[0].input_type).toBe('document')
    expect(rows[0].status).toBe('pending')
    expect(store.knowledge_base.rows!).toHaveLength(0)
  })

  test('a disguised file (declared PDF, wrong bytes) is refused before any draft', async () => {
    const { client, store } = setup()
    const sent: string[] = []
    const d = deps(sent, { downloadMedia: async () => ({ bytes: Buffer.from('<svg onload=alert(1)>'), mimeType: 'application/pdf' }) })
    await createTrainerLinkCode(asDb(client), { organizationId: ORG_A, userId: USER_A }, { now: () => new Date(T0), displayNumber: '967700000009' })
    await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'x0', type: 'text', text: 'وضع التدريب' }, d)
    await handleCentralInbound(asDb(client), { from: PHONE, messageId: 'x1', type: 'document', mediaId: 'doc-2', mimeType: 'application/pdf', fileName: 'a.pdf' }, d)
    expect(store.whatsapp_training_submissions.rows!).toHaveLength(0)
    expect(sent.join('\n')).toContain('الملفات المدعومة')
  })
})

describe('media parsing and validation', () => {
  test('parses image and document messages from Meta', () => {
    const image = parseCentralMessage({ from: PHONE, id: 'w1', type: 'image', image: { id: 'img-1', mime_type: 'image/jpeg', caption: 'المنيو' } })
    expect(image).toEqual({ from: PHONE, messageId: 'w1', type: 'image', mediaId: 'img-1', mimeType: 'image/jpeg', caption: 'المنيو', fileName: undefined })
    const doc = parseCentralMessage({ from: PHONE, id: 'w2', type: 'document', document: { id: 'doc-1', mime_type: 'application/pdf', filename: 'menu.pdf' } })
    expect(doc?.type).toBe('document')
    expect(doc?.fileName).toBe('menu.pdf')
  })

  test('validateMedia enforces allowlist and magic bytes', () => {
    expect(validateMedia('image', { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), mimeType: 'image/jpeg' }).ok).toBe(true)
    expect(validateMedia('image', { bytes: Buffer.from('<svg/>'), mimeType: 'image/svg+xml' }).ok).toBe(false)
    expect(validateMedia('image', { bytes: Buffer.from('GIF89a'), mimeType: 'image/png' }).ok).toBe(false)
    expect(validateMedia('document', { bytes: Buffer.from('%PDF-1.7'), mimeType: 'application/pdf' }).ok).toBe(true)
    expect(validateMedia('document', { bytes: Buffer.from('MZ\0\0'), mimeType: 'application/pdf' }).ok).toBe(false)
    expect(validateMedia('document', { bytes: Buffer.alloc(6 * 1024 * 1024, 65), mimeType: 'text/plain' }).ok).toBe(false)
  })
})

describe('document chunking', () => {
  test('long documents are split into paragraph chunks (≤3000 chars, ≤8 items)', async () => {
    const paragraph = 'منتج '.repeat(500).trim()
    const text = Array.from({ length: 12 }, () => paragraph).join('\n\n')
    const chunks = chunkText(text, 3000)
    expect(chunks.length).toBe(8)
    expect(chunks.every((chunk) => chunk.length <= 3000)).toBe(true)
    const draft = await extractTrainingDraft({ kind: 'document', text }, { verticalId: 'store', target: 'knowledge' }, {})
    expect(draft.items.length).toBe(8)
    expect(draft.items[0].title.endsWith('(1)')).toBe(true)
  })
})

describe('optional dedicated trainer number', () => {
  test('missing KAYAN_TRAINER_WA_* env vars disable the dedicated number without breaking routing', async () => {
    const { getTrainerBotConfig, isTrainerPhoneNumberId, trainerEntryNumber } = await import('@/lib/central-bot/config')
    expect(getTrainerBotConfig({} as NodeJS.ProcessEnv)).toBe(null)
    expect(isTrainerPhoneNumberId('', {} as NodeJS.ProcessEnv)).toBe(false)
    expect(isTrainerPhoneNumberId('123', {} as NodeJS.ProcessEnv)).toBe(false)
    expect(trainerEntryNumber({} as NodeJS.ProcessEnv).mode).toBe('none')
    const env = { KAYAN_TRAINER_WA_PHONE_NUMBER_ID: '555', KAYAN_TRAINER_WA_ACCESS_TOKEN: 't', KAYAN_TRAINER_WA_DISPLAY_NUMBER: '+967 700 000 009' } as unknown as NodeJS.ProcessEnv
    expect(isTrainerPhoneNumberId('555', env)).toBe(true)
    expect(trainerEntryNumber(env)).toEqual({ number: '967700000009', mode: 'trainer' })
  })
})
