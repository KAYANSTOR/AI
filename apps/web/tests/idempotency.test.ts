import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'

function setup() {
  const fake = createFakeSupabase({
    webhook_events: { unique: [['provider', 'external_event_id']] },
  })
  return { db: fake.db, supabase: fake.client as unknown as SupabaseClient }
}

describe('webhook idempotency', () => {
  test('the first delivery of an event is acquired', async () => {
    const { supabase } = setup()
    const result = await acquireWebhookEvent(supabase, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(result.status).toBe('acquired')
    if (result.status === 'acquired') expect(result.eventRowId).toBeTruthy()
  })

  test('a redelivered event is acknowledged as a duplicate without reprocessing', async () => {
    const { supabase, db } = setup()
    await acquireWebhookEvent(supabase, 'whatsapp', 'wamid.1', { text: 'hi' })
    const duplicate = await acquireWebhookEvent(supabase, 'whatsapp', 'wamid.1', { text: 'hi' })

    expect(duplicate.status).toBe('duplicate')
    expect(db.webhook_events.rows?.length).toBe(1)
  })

  test('the same provider event id on a different provider is a different event', async () => {
    const { supabase } = setup()
    await acquireWebhookEvent(supabase, 'whatsapp', 'shared-id', {})
    expect((await acquireWebhookEvent(supabase, 'instagram', 'shared-id', {})).status).toBe('acquired')
  })

  test('a duplicate is never reported as an error', async () => {
    const { supabase } = setup()
    await acquireWebhookEvent(supabase, 'vapi', 'call-1', {})
    const second = await acquireWebhookEvent(supabase, 'vapi', 'call-1', {})
    expect(second).toEqual({ status: 'duplicate' })
  })

  test('processing outcome is recorded on the event row', async () => {
    const { supabase, db } = setup()
    const acquired = await acquireWebhookEvent(supabase, 'twilio', 'SM1', {})
    if (acquired.status !== 'acquired') throw new Error('expected acquired')

    await markWebhookProcessed(supabase, acquired.eventRowId, 'failed', 'unmapped_twilio_number')

    const row = db.webhook_events.rows?.[0]
    expect(row?.processing_status).toBe('failed')
    expect(row?.error_message).toBe('unmapped_twilio_number')
    expect(typeof row?.processed_at).toBe('string')
  })
})
