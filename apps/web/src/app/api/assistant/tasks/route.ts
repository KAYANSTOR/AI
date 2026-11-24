import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { completePersonalTask, createPersonalTask, getPersonalSettings, listPersonalTasks, snoozePersonalTask, updatePersonalTask, upsertPersonalSettings } from '@/lib/personal-assistant/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function context() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  return { db: access.db, owner: access.owner }
}
function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'request_failed'
  const clientErrors = new Set(['invalid_task_title', 'invalid_task_due_at', 'invalid_recurrence_rule', 'nothing_to_update', 'invalid_whatsapp_channel', 'invalid_local_time', 'invalid_timezone', 'empty_memory', 'invalid_memory_category'])
  return NextResponse.json({ error: clientErrors.has(code) ? code : 'request_failed' }, { status: clientErrors.has(code) ? 400 : 500 })
}

export async function GET(request: Request) {
  const current = await context()
  if (current instanceof NextResponse) return current
  const status = new URL(request.url).searchParams.get('status') as 'all' | 'pending' | 'done' | 'snoozed' | null
  try {
    const [tasks, settings, channels] = await Promise.all([
      listPersonalTasks(current.db, current.owner, status || 'all'),
      getPersonalSettings(current.db, current.owner),
      current.db.from('channels').select('id, external_identifier, is_active').eq('organization_id', current.owner.organizationId).eq('channel_type', 'whatsapp').eq('is_active', true).order('created_at', { ascending: false }),
    ])
    return NextResponse.json({ tasks, settings, channels: channels.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  const current = await context()
  if (current instanceof NextResponse) return current
  const body = bodyObject(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  try {
    if (body.type === 'settings') {
      const settings = await upsertPersonalSettings(current.db, current.owner, {
        whatsappChannelId: typeof body.whatsappChannelId === 'string' ? body.whatsappChannelId : body.whatsappChannelId === null ? null : undefined,
        whatsappRemindersEnabled: typeof body.whatsappRemindersEnabled === 'boolean' ? body.whatsappRemindersEnabled : undefined,
        morningBriefEnabled: typeof body.morningBriefEnabled === 'boolean' ? body.morningBriefEnabled : undefined,
        morningBriefLocalTime: typeof body.morningBriefLocalTime === 'string' ? body.morningBriefLocalTime : undefined,
        timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
      })
      return NextResponse.json({ settings })
    }
    if (typeof body.title !== 'string') return NextResponse.json({ error: 'invalid_task_title' }, { status: 400 })
    const task = await createPersonalTask(current.db, current.owner, { title: body.title, notes: typeof body.notes === 'string' ? body.notes : null, dueAt: typeof body.dueAt === 'string' ? body.dueAt : null, recurrenceRule: typeof body.recurrenceRule === 'string' ? body.recurrenceRule : null })
    return NextResponse.json({ task }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: Request) {
  const current = await context()
  if (current instanceof NextResponse) return current
  const body = bodyObject(await request.json().catch(() => null))
  if (!body || typeof body.id !== 'string') return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  try {
    const task = body.action === 'complete'
      ? await completePersonalTask(current.db, current.owner, body.id)
      : body.action === 'snooze' && typeof body.dueAt === 'string'
        ? await snoozePersonalTask(current.db, current.owner, body.id, body.dueAt)
        : await updatePersonalTask(current.db, current.owner, body.id, { title: typeof body.title === 'string' ? body.title : undefined, notes: typeof body.notes === 'string' ? body.notes : undefined, dueAt: typeof body.dueAt === 'string' || body.dueAt === null ? body.dueAt : undefined, status: body.status === 'pending' || body.status === 'done' || body.status === 'snoozed' ? body.status : undefined })
    if (!task) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ task })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request) {
  const current = await context()
  if (current instanceof NextResponse) return current
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const { data, error } = await current.db.from('personal_tasks').delete().eq('id', id).eq('organization_id', current.owner.organizationId).eq('user_id', current.owner.userId).select('id')
  if (error) return errorResponse(error)
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
