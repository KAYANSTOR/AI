import type { DbClient } from '@/lib/db/client'

export type PersonalTaskStatus = 'pending' | 'done' | 'snoozed'
export type PersonalTask = {
  id: string
  title: string
  notes: string | null
  due_at: string | null
  recurrence_rule: string | null
  status: PersonalTaskStatus
  reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

export type PersonalOwner = { organizationId: string; userId: string }

function ownerQuery(db: DbClient, owner: PersonalOwner) {
  return db.from('personal_tasks').eq('organization_id', owner.organizationId).eq('user_id', owner.userId)
}

export async function listPersonalTasks(
  db: DbClient,
  owner: PersonalOwner,
  status?: PersonalTaskStatus | 'all'
): Promise<PersonalTask[]> {
  let query = ownerQuery(db, owner).select('id, title, notes, due_at, recurrence_rule, status, reminder_sent_at, created_at, updated_at').order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(200)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as PersonalTask[]
}

export async function createPersonalTask(
  db: DbClient,
  owner: PersonalOwner,
  input: { title: string; notes?: string | null; dueAt?: string | null; recurrenceRule?: string | null }
): Promise<PersonalTask> {
  const title = input.title.trim()
  if (!title || title.length > 300) throw new Error('invalid_task_title')
  const dueAt = input.dueAt ? new Date(input.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error('invalid_task_due_at')
  if (input.recurrenceRule && input.recurrenceRule.length > 255) throw new Error('invalid_recurrence_rule')
  const { data, error } = await db.from('personal_tasks').insert({
    organization_id: owner.organizationId,
    user_id: owner.userId,
    title,
    notes: input.notes?.trim() || null,
    due_at: dueAt?.toISOString() ?? null,
    recurrence_rule: input.recurrenceRule?.trim() || null,
    status: 'pending',
  }).select('id, title, notes, due_at, recurrence_rule, status, reminder_sent_at, created_at, updated_at').single()
  if (error || !data) throw new Error(error?.message ?? 'task_create_failed')
  return data as unknown as PersonalTask
}

export async function updatePersonalTask(
  db: DbClient,
  owner: PersonalOwner,
  id: string,
  input: { title?: string; notes?: string | null; dueAt?: string | null; recurrenceRule?: string | null; status?: PersonalTaskStatus }
): Promise<PersonalTask | null> {
  const updates: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title || title.length > 300) throw new Error('invalid_task_title')
    updates.title = title
  }
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null
  if (input.dueAt !== undefined) {
    const dueAt = input.dueAt ? new Date(input.dueAt) : null
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error('invalid_task_due_at')
    updates.due_at = dueAt?.toISOString() ?? null
    updates.reminder_sent_at = null
  }
  if (input.recurrenceRule !== undefined) {
    if (input.recurrenceRule && input.recurrenceRule.length > 255) throw new Error('invalid_recurrence_rule')
    updates.recurrence_rule = input.recurrenceRule?.trim() || null
  }
  if (input.status !== undefined) updates.status = input.status
  if (!Object.keys(updates).length) throw new Error('nothing_to_update')
  const { data, error } = await ownerQuery(db, owner).update(updates).eq('id', id)
    .select('id, title, notes, due_at, recurrence_rule, status, reminder_sent_at, created_at, updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as PersonalTask | null) ?? null
}

export async function completePersonalTask(db: DbClient, owner: PersonalOwner, id: string) {
  return updatePersonalTask(db, owner, id, { status: 'done' })
}

export async function snoozePersonalTask(db: DbClient, owner: PersonalOwner, id: string, dueAt: string) {
  return updatePersonalTask(db, owner, id, { status: 'snoozed', dueAt })
}

export async function getPersonalSettings(db: DbClient, owner: PersonalOwner) {
  const { data, error } = await db.from('personal_assistant_settings')
    .select('id, whatsapp_channel_id, whatsapp_reminders_enabled, morning_brief_enabled, morning_brief_local_time, timezone, last_morning_brief_local_date')
    .eq('organization_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}

export async function upsertPersonalSettings(db: DbClient, owner: PersonalOwner, input: {
  whatsappChannelId?: string | null
  whatsappRemindersEnabled?: boolean
  morningBriefEnabled?: boolean
  morningBriefLocalTime?: string
  timezone?: string
}) {
  if (input.whatsappChannelId) {
    const channel = await db.from('channels').select('id').eq('id', input.whatsappChannelId)
      .eq('organization_id', owner.organizationId).eq('channel_type', 'whatsapp').eq('is_active', true).maybeSingle()
    if (!channel.data) throw new Error('invalid_whatsapp_channel')
  }
  if (input.morningBriefLocalTime && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(input.morningBriefLocalTime)) throw new Error('invalid_local_time')
  if (input.timezone && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/.test(input.timezone)) throw new Error('invalid_timezone')
  const existing = await getPersonalSettings(db, owner)
  const updates: Record<string, unknown> = {
    organization_id: owner.organizationId,
    user_id: owner.userId,
    whatsapp_channel_id: input.whatsappChannelId ?? existing?.whatsapp_channel_id ?? null,
    whatsapp_reminders_enabled: input.whatsappRemindersEnabled ?? existing?.whatsapp_reminders_enabled ?? false,
    morning_brief_enabled: input.morningBriefEnabled ?? existing?.morning_brief_enabled ?? false,
    morning_brief_local_time: input.morningBriefLocalTime ?? existing?.morning_brief_local_time ?? '08:00:00',
    timezone: input.timezone ?? existing?.timezone ?? 'Asia/Riyadh',
  }
  const { data, error } = await db.from('personal_assistant_settings').upsert(updates, { onConflict: 'organization_id,user_id' })
    .select('id, whatsapp_channel_id, whatsapp_reminders_enabled, morning_brief_enabled, morning_brief_local_time, timezone, last_morning_brief_local_date').single()
  if (error || !data) throw new Error(error?.message ?? 'settings_save_failed')
  return data
}
