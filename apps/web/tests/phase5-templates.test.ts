import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { planWhatsAppDelivery, whatsappWindowState, isBusinessInitiatedEvent } from '@/lib/channels/whatsapp-window'
import {
  buildTemplateParameters,
  buildTemplateSubmission,
  mapMetaStatus,
  mapMetaTemplate,
  normalizeCategory,
  normalizeTemplateName,
  renderTemplateBody,
  submitWhatsAppTemplate,
  syncWhatsAppTemplates,
  templateVariableCount,
} from '@/lib/channels/whatsapp-templates'
import { planBusinessWhatsApp } from '@/lib/channels/whatsapp-dispatch'
import { createFakeDb } from './support/fake-db'

process.env.META_GRAPH_BASE_URL = 'https://graph.test.local'

const NOW = new Date('2026-03-01T12:00:00.000Z')
const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const CHANNEL = 'bbbbbbbb-0000-4000-8000-000000000001'
const CONVERSATION = 'cccccccc-0000-4000-8000-000000000001'

describe('24-hour customer service window', () => {
  test('a recent inbound message keeps the window open', () => {
    const state = whatsappWindowState(new Date(NOW.getTime() - 60_000).toISOString(), NOW)
    expect(state.open).toBe(true)
    expect(state.remainingMs).toBeGreaterThan(0)
  })

  test('an inbound older than 24 hours closes the window', () => {
    const state = whatsappWindowState(new Date(NOW.getTime() - 25 * 60 * 60_000).toISOString(), NOW)
    expect(state.open).toBe(false)
    expect(state.remainingMs).toBe(0)
  })

  test('a missing inbound timestamp is treated as a closed window', () => {
    expect(whatsappWindowState(null, NOW).open).toBe(false)
  })

  test('business text inside the window stays free-form text', () => {
    expect(planWhatsAppDelivery({
      channelType: 'whatsapp',
      connectionMode: 'cloud_api',
      initiatedBy: 'business',
      lastInboundAt: new Date(NOW.getTime() - 3600_000).toISOString(),
      now: NOW,
      approvedTemplate: { name: 'reminder', languageCode: 'ar' },
    })).toEqual({ kind: 'text', reason: 'inside_window' })
  })

  test('outside the window the approved template is chosen automatically', () => {
    const plan = planWhatsAppDelivery({
      channelType: 'whatsapp',
      connectionMode: 'cloud_api',
      initiatedBy: 'business',
      lastInboundAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString(),
      now: NOW,
      approvedTemplate: { name: 'reminder', languageCode: 'ar' },
    })
    expect(plan.kind).toBe('template')
    if (plan.kind === 'template') expect(plan.templateKey).toEqual({ name: 'reminder', languageCode: 'ar' })
  })

  test('outside the window without an approved template is blocked, not silently sent', () => {
    const plan = planWhatsAppDelivery({
      channelType: 'whatsapp',
      connectionMode: 'cloud_api',
      initiatedBy: 'business',
      lastInboundAt: null,
      now: NOW,
      approvedTemplate: null,
    })
    expect(plan).toEqual({ kind: 'blocked', reason: 'inbound_unknown_but_required' })
  })

  test('customer replies and QR channels always use text', () => {
    expect(planWhatsAppDelivery({ channelType: 'whatsapp', initiatedBy: 'customer', now: NOW }).kind).toBe('text')
    expect(planWhatsAppDelivery({ channelType: 'whatsapp', connectionMode: 'qr_unofficial', initiatedBy: 'business', now: NOW }).kind).toBe('text')
  })

  test('reminders, campaigns, follow-ups and assistant notices are business-initiated', () => {
    for (const event of ['appointment.reminder', 'campaign.send', 'followup.step', 'personal_assistant']) {
      expect(isBusinessInitiatedEvent(event)).toBe(true)
    }
    expect(isBusinessInitiatedEvent('message.send')).toBe(false)
  })
})

describe('template body helpers', () => {
  test('counts and renders positional variables in order', () => {
    expect(templateVariableCount('مرحباً {{1}}، موعدك {{2}}')).toBe(2)
    expect(templateVariableCount('لا متغيّرات')).toBe(0)
    expect(renderTemplateBody('مرحباً {{1}} — {{2}}', ['سارة', 'الأحد'])).toBe('مرحباً سارة — الأحد')
  })

  test('builds body parameters for the exact variable count', () => {
    expect(buildTemplateParameters('مرحباً {{1}} {{2}}', ['سارة'])).toEqual(['سارة', ''])
    expect(buildTemplateParameters('بلا متغيرات', ['ignored'])).toEqual([])
  })

  test('normalizes names/categories to Meta requirements', () => {
    expect(normalizeTemplateName('Appointment Reminder!')).toBe('appointment_reminder')
    expect(normalizeCategory('marketing')).toBe('MARKETING')
    expect(normalizeCategory('unknown')).toBe('UTILITY')
  })

  test('submission requires one example per variable', () => {
    expect(() => buildTemplateSubmission({
      name: 'reminder', languageCode: 'ar', category: 'UTILITY', bodyText: 'مرحباً {{1}}',
    })).toThrow('template_examples_required')

    const submission = buildTemplateSubmission({
      name: 'reminder', languageCode: 'ar', category: 'UTILITY', bodyText: 'مرحباً {{1}}', examples: ['سارة'],
    })
    expect(submission.payload).toEqual({
      name: 'reminder',
      language: 'ar',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'مرحباً {{1}}', example: { body_text: [['سارة']] } }],
    })
  })

  test('maps Meta template records and statuses', () => {
    expect(mapMetaStatus('APPROVED')).toBe('approved')
    expect(mapMetaStatus('PENDING')).toBe('pending')
    expect(mapMetaStatus('REJECTED')).toBe('rejected')
    expect(mapMetaTemplate({
      id: '123', name: 'reminder', language: 'ar', status: 'APPROVED', category: 'UTILITY',
      components: [{ type: 'BODY', text: 'مرحباً {{1}}', example: { body_text: [['سارة']] } }],
    })).toMatchObject({
      metaTemplateId: '123', templateName: 'reminder', languageCode: 'ar', status: 'approved', variablesSchema: ['سارة'],
    })
    expect(mapMetaTemplate({ name: 'Invalid Name', components: [] })).toBeNull()
  })
})

describe('Meta template sync and submission', () => {
  test('sync stores the approved template projection', async () => {
    const fake = createFakeDb({ whatsapp_message_templates: { rows: [] } })
    const result = await syncWhatsAppTemplates(fake.client as unknown as DbClient, {
      organizationId: ORG,
      channelId: CHANNEL,
      wabaId: 'waba-1',
      accessToken: 'token',
      now: NOW,
      fetchImpl: (async () => new Response(JSON.stringify({
        data: [
          { id: 't1', name: 'reminder', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'مرحباً {{1}}', example: { body_text: [['سارة']] } }] },
          { id: 't2', name: 'Bad Name', components: [] },
        ],
      }), { status: 200 })) as unknown as typeof fetch,
    })

    expect(result).toEqual({ scanned: 2, saved: 1, skipped: 1 })
    expect(fake.store.whatsapp_message_templates.rows?.[0]).toMatchObject({
      org_id: ORG, channel_id: CHANNEL, template_name: 'reminder', status: 'approved',
    })
  })

  test('submission stores the template as pending review', async () => {
    const fake = createFakeDb({ whatsapp_message_templates: { rows: [] } })
    const result = await submitWhatsAppTemplate(fake.client as unknown as DbClient, {
      organizationId: ORG,
      channelId: CHANNEL,
      wabaId: 'waba-1',
      accessToken: 'token',
      name: 'follow_up',
      languageCode: 'ar',
      category: 'UTILITY',
      bodyText: 'مرحباً {{1}}',
      examples: ['سارة'],
      now: NOW,
      fetchImpl: (async () => new Response(JSON.stringify({ id: 'meta-9' }), { status: 200 })) as unknown as typeof fetch,
    })
    expect(result.status).toBe('pending')
    expect(fake.store.whatsapp_message_templates.rows?.[0]).toMatchObject({ template_name: 'follow_up', status: 'pending' })
  })
})

describe('smart dispatch with the database projection', () => {
  function setup(template: Record<string, unknown> | null, lastInboundAt: string | null) {
    const fake = createFakeDb({
      conversations: { rows: [{ id: CONVERSATION, organization_id: ORG, last_inbound_at: lastInboundAt }] },
      whatsapp_message_templates: { rows: template ? [template] : [] },
    })
    return fake
  }

  test('uses an approved template when the window is closed', async () => {
    const fake = setup({
      id: 't1', org_id: ORG, channel_id: CHANNEL, template_name: 'reminder', language_code: 'ar',
      category: 'UTILITY', body_text: 'مرحباً {{1}}', status: 'approved', variables_schema: ['سارة'], updated_at: '2026-02-01T00:00:00Z',
    }, new Date(NOW.getTime() - 30 * 3600_000).toISOString())

    const plan = await planBusinessWhatsApp(fake.client as unknown as DbClient, {
      organizationId: ORG,
      channelId: CHANNEL,
      connectionMode: 'cloud_api',
      recipient: '967777123456',
      conversationId: CONVERSATION,
      templateVariables: ['سارة'],
      now: NOW,
    })
    expect(plan.kind).toBe('template')
    if (plan.kind === 'template') {
      expect(plan.template).toEqual({ name: 'reminder', languageCode: 'ar', bodyParameters: ['سارة'] })
      expect(plan.resolvedRow?.template_name).toBe('reminder')
    }
  })

  test('keeps free-form text inside the window', async () => {
    const fake = setup(null, new Date(NOW.getTime() - 60_000).toISOString())
    const plan = await planBusinessWhatsApp(fake.client as unknown as DbClient, {
      organizationId: ORG,
      channelId: CHANNEL,
      connectionMode: 'cloud_api',
      recipient: '967777123456',
      conversationId: CONVERSATION,
      now: NOW,
    })
    expect(plan.kind).toBe('text')
  })

  test('blocks when the window is closed and nothing is approved', async () => {
    const fake = setup(null, null)
    const plan = await planBusinessWhatsApp(fake.client as unknown as DbClient, {
      organizationId: ORG,
      channelId: CHANNEL,
      connectionMode: 'cloud_api',
      recipient: '967777123456',
      conversationId: CONVERSATION,
      now: NOW,
    })
    expect(plan.kind).toBe('blocked')
  })
})
