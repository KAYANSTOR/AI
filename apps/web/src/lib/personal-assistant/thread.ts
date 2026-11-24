import type { DbClient } from '@/lib/db/client'

/**
 * One personal-assistant conversation per owner, shared by the web chat and the
 * central WhatsApp bot, so both surfaces show the same history.
 */
export type ThreadMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  source: 'web' | 'whatsapp' | 'system'
  message_type: 'text' | 'voice' | 'approval' | 'receipt'
  content: string
  task_id: string | null
  created_at: string
}

type Owner = { organizationId: string; userId: string }

export async function appendThreadMessage(
  db: DbClient,
  owner: Owner,
  input: { direction: ThreadMessage['direction']; source: ThreadMessage['source']; type?: ThreadMessage['message_type']; content: string; externalMessageId?: string | null; taskId?: string | null }
): Promise<{ id: string } | { duplicate: true }> {
  const content = input.content.trim().slice(0, 8000) || '…'
  const { data, error } = await db.from('personal_assistant_messages').insert({
    org_id: owner.organizationId,
    user_id: owner.userId,
    direction: input.direction,
    source: input.source,
    message_type: input.type ?? 'text',
    content,
    external_message_id: input.externalMessageId ?? null,
    task_id: input.taskId ?? null,
  }).select('id').single()
  if (error?.code === '23505') return { duplicate: true }
  if (error || !data) throw new Error('thread_append_failed')
  return { id: String(data.id) }
}

export async function threadHasExternalMessage(db: DbClient, externalMessageId: string) {
  const { data } = await db.from('personal_assistant_messages').select('id').eq('external_message_id', externalMessageId).maybeSingle()
  return Boolean(data)
}

export async function listThread(db: DbClient, owner: Owner, limit = 80): Promise<ThreadMessage[]> {
  const { data, error } = await db.from('personal_assistant_messages')
    .select('id, direction, source, message_type, content, task_id, created_at')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error('thread_list_failed')
  return ((data ?? []) as unknown as ThreadMessage[]).reverse()
}
