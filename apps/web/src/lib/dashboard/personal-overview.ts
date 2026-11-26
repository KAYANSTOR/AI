import type { DbClient } from '@/lib/db/client'
import type { PersonalOwner } from '@/lib/personal-assistant/tasks'

type UpcomingTask = { id: string; title: string; due_at: string | null; status: 'pending' | 'snoozed' }

export type PersonalOverview = {
  open: number | null
  completed: number | null
  memories: number | null
  tasks: UpcomingTask[] | null
}

export async function loadPersonalOverview(db: DbClient, owner: PersonalOwner): Promise<PersonalOverview> {
  const tasks = () => db.from('personal_tasks').eq('organization_id', owner.organizationId).eq('user_id', owner.userId)
  const [open, completed, memories] = await Promise.all([
    tasks().select('id, title, due_at, status', { count: 'exact' })
      .in('status', ['pending', 'snoozed'])
      .order('due_at', { ascending: true, nullsFirst: false }).order('id').limit(3),
    tasks().select('id', { count: 'exact', head: true }).eq('status', 'done'),
    db.from('user_memories').select('id', { count: 'exact', head: true })
      .eq('organization_id', owner.organizationId).eq('user_id', owner.userId),
  ])
  return {
    open: open.error ? null : open.count,
    completed: completed.error ? null : completed.count,
    memories: memories.error ? null : memories.count,
    tasks: open.error ? null : (open.data ?? []) as UpcomingTask[],
  }
}
