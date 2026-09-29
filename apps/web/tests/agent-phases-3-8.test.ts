import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FakeDb } from './support/fake-supabase'
import { createFakeSupabase } from './support/fake-supabase'
import { createNotification, listNotifications, markNotificationRead } from '@/lib/notifications'
import { getCustomerSummary, getCustomerTimeline } from '@/lib/customer360'
import { getNextFollowUpStep, markFollowUpAsSent } from '@/lib/followup'
import { evaluateSegment } from '@/lib/segments'
import { checkAppointmentAvailability } from '@/lib/appointments'
import { calculateQuoteTotals, createOrderFromQuote, validateQuoteTotals } from '@/lib/sales'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000201'
const CONTACT = 'aaaaaaaa-0000-4000-8000-000000000202'
const MEMBER = 'aaaaaaaa-0000-4000-8000-000000000203'

function setup(tables: FakeDb) {
  const fake = createFakeSupabase(tables)
  return { supabase: fake.client as unknown as SupabaseClient }
}

describe('agent phase 3-8', () => {
  test('notifications are created, listed, and marked read by org/member scope', async () => {
    const { supabase } = setup({
      notifications: {
        rows: [
          { id: 'n-1', organization_id: ORG, member_id: MEMBER, entity_type: 'conversation', entity_id: 'c-1', notification_type: 'handoff', title: 'Handoff', body: 'Review this customer', is_read: false, created_at: '2026-01-01T00:00:00Z' },
          { id: 'n-2', organization_id: 'other', member_id: MEMBER, entity_type: 'conversation', entity_id: 'c-2', notification_type: 'assignment', title: 'Other', body: 'Ignore me', is_read: false, created_at: '2026-01-02T00:00:00Z' },
        ],
      },
    })

    const created = await createNotification(supabase, {
      organizationId: ORG,
      memberId: MEMBER,
      entityType: 'conversation',
      entityId: 'c-3',
      notificationType: 'assignment',
      title: 'Assigned',
      body: 'A team member has been assigned',
    })

    if (!created) throw new Error('Expected notification to be created')
    expect(created.title).toBe('Assigned')
    const list = await listNotifications(supabase, ORG, MEMBER)
    expect(list.some((n) => n.id === created.id)).toBe(true)

    const updated = await markNotificationRead(supabase, ORG, created.id)
    expect(updated.is_read).toBe(true)
  })

  test('customer 360 timeline and summary aggregate by contact and tenant', async () => {
    const { supabase } = setup({
      conversations: {
        rows: [
          { id: 'conv-1', organization_id: ORG, contact_id: CONTACT, status: 'active', created_at: '2026-01-01T00:00:00Z', summary: 'Inbound lead' },
          { id: 'conv-2', organization_id: 'other', contact_id: CONTACT, status: 'active', created_at: '2026-01-03T00:00:00Z', summary: 'Other org' },
        ],
      },
      appointments: {
        rows: [
          { id: 'appt-1', organization_id: ORG, contact_id: CONTACT, service_id: 'svc-1', starts_at: '2026-01-05T10:00:00Z', ends_at: '2026-01-05T11:00:00Z', status: 'confirmed', notes: 'Follow up' },
        ],
      },
      quotes: {
        rows: [
          { id: 'quote-1', organization_id: ORG, contact_id: CONTACT, status: 'sent', total: 180, created_at: '2026-01-02T00:00:00Z' },
        ],
      },
      orders: {
        rows: [
          { id: 'order-1', organization_id: ORG, contact_id: CONTACT, status: 'processing', total: 220, created_at: '2026-01-04T00:00:00Z' },
        ],
      },
    })

    const summary = await getCustomerSummary(supabase, ORG, CONTACT)
    expect(summary.conversations).toBe(1)
    expect(summary.appointments).toBe(1)
    expect(summary.quotes).toBe(1)
    expect(summary.orders).toBe(1)

    const timeline = await getCustomerTimeline(supabase, ORG, CONTACT)
    expect(timeline.length > 3).toBe(true)
    expect(timeline.some((event) => event.type === 'appointment')).toBe(true)
  })

  test('follow-up engine picks the next scheduled step and records it as sent', async () => {
    const { supabase } = setup({
      followup_enrollments: {
        rows: [
          { id: 'en-1', organization_id: ORG, contact_id: CONTACT, sequence_id: 'seq-1', current_step_id: 'step-1', status: 'scheduled', next_send_at: '2026-01-06T00:00:00Z' },
        ],
      },
      followup_steps: {
        rows: [
          { id: 'step-1', sequence_id: 'seq-1', step_order: 1, delay_minutes: 60, channel: 'sms', template_content: 'Thanks for your inquiry' },
          { id: 'step-2', sequence_id: 'seq-1', step_order: 2, delay_minutes: 180, channel: 'email', template_content: 'Follow up email' },
        ],
      },
    })

    const next = await getNextFollowUpStep(supabase, ORG, CONTACT)
    expect(next?.channel).toBe('sms')
    expect(next?.templateContent).toContain('Thanks')

    await markFollowUpAsSent(supabase, ORG, 'en-1')
    const after = await getNextFollowUpStep(supabase, ORG, CONTACT)
    expect(after).toBeNull()
  })

  test('segment evaluator filters contacts by tenant rules', async () => {
    const { supabase } = setup({
      contacts: {
        rows: [
          { id: CONTACT, organization_id: ORG, first_name: 'Ali', last_name: 'Saleh', stage: 'qualified', score: 93 },
          { id: 'other-contact', organization_id: 'other', first_name: 'Sara', last_name: 'Khan', stage: 'new', score: 20 },
        ],
      },
    })

    const match = await evaluateSegment(supabase, ORG, CONTACT, [{ field: 'stage', op: 'eq', value: 'qualified' }, { field: 'score', op: 'gt', value: 80 }])
    expect(match.matches).toBe(true)

    const noMatch = await evaluateSegment(supabase, ORG, CONTACT, [{ field: 'stage', op: 'eq', value: 'new' }])
    expect(noMatch.matches).toBe(false)
  })

  test('appointment availability blocks overlapping service slot', async () => {
    const { supabase } = setup({
      appointments: {
        rows: [
          { id: 'appt-1', organization_id: ORG, service_id: 'svc-1', starts_at: '2026-02-10T10:00:00Z', ends_at: '2026-02-10T11:00:00Z', status: 'confirmed' },
          { id: 'appt-2', organization_id: ORG, service_id: 'svc-1', starts_at: '2026-02-10T12:00:00Z', ends_at: '2026-02-10T13:00:00Z', status: 'cancelled' },
        ],
      },
    })

    const free = await checkAppointmentAvailability(supabase, ORG, 'svc-1', '2026-02-10T10:30:00Z', '2026-02-10T11:30:00Z')
    expect(free.available).toBe(false)
    expect(free.conflict?.id).toBe('appt-1')

    const open = await checkAppointmentAvailability(supabase, ORG, 'svc-1', '2026-02-10T13:30:00Z', '2026-02-10T14:00:00Z')
    expect(open.available).toBe(true)
  })

  test('quote totals and order conversion reject mismatched totals', () => {
    const totals = calculateQuoteTotals([
      { name: 'Massage', quantity: 2, unitPrice: 100 },
      { name: 'Package', quantity: 1, unitPrice: 50, discount: 10 },
    ], 25, 0.10)

    expect(totals.subtotal).toBe(250)
    expect(totals.discount).toBe(25)
    expect(totals.total).toBe(247.5)

    expect(validateQuoteTotals({ subtotal: 250, discount: 25, tax: 22.5, total: 247.5 }, [
      { name: 'Massage', quantity: 2, unitPrice: 100 },
      { name: 'Package', quantity: 1, unitPrice: 50, discount: 10 },
    ], 25, 0.10)).toBe(true)

    expect(() => createOrderFromQuote({ organization_id: ORG, contact_id: CONTACT, total: 100 }, [
      { name: 'Massage', quantity: 2, unitPrice: 100 },
    ])).toThrow(/quote total mismatch/i)
  })
})
