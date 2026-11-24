import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import { findUserById } from '@/lib/auth/users'
import { normalizePhone } from '@/lib/auth/users'
import { extractPersonalMemories } from '@/lib/personal-assistant/runtime'
import { savePersonalMemory } from '@/lib/personal-assistant/memory-retrieval'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])) as Record<string, string>
}
function localDate(date: Date, timeZone: string) {
  const p = localParts(date, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}
function dueTimeReached(date: Date, timeZone: string, configured: string) {
  const p = localParts(date, timeZone)
  const [hour, minute] = configured.slice(0, 5).split(':').map(Number)
  return Number(p.hour) * 60 + Number(p.minute) >= hour * 60 + minute
}

async function enqueuePersonalMessage(db: ReturnType<typeof createAdminClient>, input: { organizationId: string; channelId: string; recipient: string; idempotencyKey: string; taskId?: string; body: string }) {
  const channel = await db.from('channels').select('id, channel_type, connection_mode, is_active').eq('id', input.channelId).eq('organization_id', input.organizationId).maybeSingle()
  if (!channel.data || channel.data.channel_type !== 'whatsapp' || channel.data.is_active !== true) return 'skipped_channel'
  const templateName = process.env.PERSONAL_ASSISTANT_META_TEMPLATE_NAME?.trim()
  const connectionMode = String(channel.data.connection_mode || '')
  if (connectionMode !== 'qr_unofficial' && !templateName) return 'skipped_meta_without_approved_template'
  const payload = connectionMode === 'qr_unofficial'
    ? { kind: 'personal_assistant', personal_task_id: input.taskId ?? null, body: input.body }
    : { kind: 'personal_assistant', personal_task_id: input.taskId ?? null, body: input.body, whatsapp_template: { name: templateName, languageCode: process.env.PERSONAL_ASSISTANT_META_TEMPLATE_LANGUAGE?.trim() || 'ar', bodyParameters: [input.body.slice(0, 900)] } }
  const { error } = await db.from('outbox_events').insert({ organization_id: input.organizationId, business_id: null, channel_id: input.channelId, event_type: 'personal_assistant.send', idempotency_key: input.idempotencyKey, recipient: input.recipient, payload, scheduled_at: new Date().toISOString() })
  if (error && error.code !== '23505') throw new Error(error.message)
  return error?.code === '23505' ? 'duplicate' : 'queued'
}

async function processExtractionJobs(db: ReturnType<typeof createAdminClient>) {
  const { data: jobs } = await db.from('personal_assistant_extraction_jobs').select('id, organization_id, user_id, source_message_id').in('status', ['pending', 'failed']).order('created_at').limit(20)
  let processed = 0
  for (const job of jobs ?? []) {
    const claim = await db.from('personal_assistant_extraction_jobs').update({ status: 'processing', attempts: Number((job as Record<string, unknown>).attempts ?? 0) + 1 }).eq('id', job.id).in('status', ['pending', 'failed']).select('id').maybeSingle()
    if (!claim.data) continue
    try {
      const source = await db.from('messages').select('content').eq('id', job.source_message_id).eq('organization_id', job.organization_id).maybeSingle()
      const text = typeof source.data?.content === 'string' ? source.data.content : ''
      if (text) {
        const memories = await extractPersonalMemories(text)
        for (const memory of memories) await savePersonalMemory(db, { organizationId: job.organization_id, userId: job.user_id }, memory)
      }
      await db.from('personal_assistant_extraction_jobs').update({ status: 'done', processed_at: new Date().toISOString(), last_error: null }).eq('id', job.id)
      processed += 1
    } catch (error) {
      await db.from('personal_assistant_extraction_jobs').update({ status: 'failed', last_error: (error instanceof Error ? error.message : 'extraction_failed').slice(0, 500) }).eq('id', job.id)
    }
  }
  return processed
}

async function processReminders(db: ReturnType<typeof createAdminClient>) {
  const { data: settingsRows } = await db.from('personal_assistant_settings').select('organization_id, user_id, whatsapp_channel_id, whatsapp_reminders_enabled, morning_brief_enabled, morning_brief_local_time, timezone, last_morning_brief_local_date').eq('whatsapp_reminders_enabled', true).limit(200)
  let queued = 0
  for (const settings of settingsRows ?? []) {
    if (!settings.whatsapp_channel_id) continue
    const user = await findUserById(settings.user_id)
    const recipient = user?.phone ? normalizePhone(user.phone) : null
    if (!recipient) continue
    const now = new Date()
    const tasks = await db.from('personal_tasks').select('id, title, due_at, status, reminder_sent_at').eq('organization_id', settings.organization_id).eq('user_id', settings.user_id).in('status', ['pending', 'snoozed']).not('due_at', 'is', null).lte('due_at', now.toISOString()).is('reminder_sent_at', null).limit(50)
    for (const task of tasks.data ?? []) {
      const key = `personal-task-reminder:${task.id}:${new Date(task.due_at).toISOString()}`
      const result = await enqueuePersonalMessage(db, { organizationId: settings.organization_id, channelId: settings.whatsapp_channel_id, recipient, idempotencyKey: key, taskId: task.id, body: `تذكير شخصي: ${task.title}` })
      if (result === 'queued' || result === 'duplicate') queued += 1
    }
    if (settings.morning_brief_enabled && dueTimeReached(now, settings.timezone || 'Asia/Riyadh', settings.morning_brief_local_time || '08:00')) {
      const today = localDate(now, settings.timezone || 'Asia/Riyadh')
      if (settings.last_morning_brief_local_date !== today) {
        const open = await db.from('personal_tasks').select('title, due_at').eq('organization_id', settings.organization_id).eq('user_id', settings.user_id).in('status', ['pending', 'snoozed']).order('due_at').limit(8)
        const body = open.data?.length ? `ملخصك اليومي: لديك ${open.data.length} مهمة مفتوحة. ${open.data.slice(0, 3).map((task) => task.title).join('، ')}` : 'ملخصك اليومي: لا توجد مهام مفتوحة حالياً.'
        const result = await enqueuePersonalMessage(db, { organizationId: settings.organization_id, channelId: settings.whatsapp_channel_id, recipient, idempotencyKey: `personal-daily-brief:${settings.user_id}:${today}`, body })
        if (result === 'queued' || result === 'duplicate') {
          await db.from('personal_assistant_settings').update({ last_morning_brief_local_date: today }).eq('organization_id', settings.organization_id).eq('user_id', settings.user_id)
          queued += 1
        }
      }
    }
  }
  return queued
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = createAdminClient()
  try {
    const extracted = await processExtractionJobs(db)
    const queued = await processReminders(db)
    return NextResponse.json({ extracted, queued })
  } catch (error) {
    console.error('personal_assistant_heartbeat_failed', error)
    return NextResponse.json({ error: 'heartbeat_failed' }, { status: 500 })
  }
}
export const GET = POST
