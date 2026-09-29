import type { SupabaseClient } from '@supabase/supabase-js'

export type CannedReply = {
  id: string
  title: string
  body: string
  shortcut: string | null
  channel: string | null
  is_active: boolean
}

export async function listCannedReplies(
  supabase: SupabaseClient,
  organizationId: string,
  channel?: string | null
): Promise<CannedReply[]> {
  let query = supabase
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
