import type { DbClient } from '@/lib/db/client'

export type CannedReply = {
  id: string
  title: string
  body: string
  shortcut: string | null
  channel: string | null
  is_active: boolean
}

export async function listCannedReplies(
  db: DbClient,
  organizationId: string,
  channel?: string | null
): Promise<CannedReply[]> {
  let query = db
    .from('canned_replies')
    .select('id, title, body, shortcut, channel, is_active')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('title')

  if (channel) {
    query = query.or(`channel.is.null,channel.eq.${channel}`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CannedReply[]
}
