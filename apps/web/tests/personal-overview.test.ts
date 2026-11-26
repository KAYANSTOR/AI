import { describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { loadPersonalOverview } from '@/lib/dashboard/personal-overview'

type Row = { id: string; organization_id: string; user_id: string; status?: string; title?: string; due_at?: string | null }
type Result = { data: Row[] | null; count: number | null; error: { message: string } | null }
const owner = { organizationId: 'org-a', userId: 'user-a' }

function fixture(failedTable?: string) {
  const mine = { organization_id: owner.organizationId, user_id: owner.userId }
  const other = { organization_id: 'org-b', user_id: owner.userId }
  const otherUser = { organization_id: owner.organizationId, user_id: 'user-b' }
  const tables: Record<string, Row[]> = {
    personal_tasks: [
      ...Array.from({ length: 4 }, (_, i) => ({ ...mine, id: 'p' + i, title: 'Task ' + i, due_at: null, status: 'pending' })),
      { ...mine, id: 's', title: 'Snoozed', status: 'snoozed' },
      { ...mine, id: 'd', status: 'done' },
      { ...other, id: 'foreign-org', status: 'pending' },
      { ...otherUser, id: 'foreign-user', status: 'pending' },
    ],
    user_memories: [{ ...mine, id: 'm1' }, { ...other, id: 'm2' }, { ...otherUser, id: 'm3' }],
  }
  const db = {
    from(table: string) {
      let rows = tables[table] ?? []
      let limit = rows.length
      let head = false
      const query = {
        select(_columns: string, options?: { head?: boolean }) { head = options?.head === true; return query },
        eq(column: keyof Row, value: string) { rows = rows.filter(row => row[column] === value); return query },
        in(column: keyof Row, values: string[]) { rows = rows.filter(row => values.includes(String(row[column]))); return query },
        order() { return query },
        limit(value: number) { limit = value; return query },
        then(resolve: (result: Result) => unknown) {
          return Promise.resolve(table === failedTable ? { data: null, count: null, error: { message: 'db error' } } : { data: head ? null : rows.slice(0, limit), count: rows.length, error: null }).then(resolve)
        },
      }
      return query
    },
  } as unknown as DbClient
  return db
}

describe('personal overview privacy and truthful counters', () => {
  test('counts only the current organization and user, including snoozed tasks, with bounded previews', async () => {
    const result = await loadPersonalOverview(fixture(), owner)
    expect(result.open).toBe(5)
    expect(result.completed).toBe(1)
    expect(result.memories).toBe(1)
    expect(result.tasks?.length).toBe(3)
    expect(result.tasks?.map(task => task.id)).toEqual(['p0', 'p1', 'p2'])
  })
  test('a database error is unavailable, never a misleading zero or empty state', async () => {
    const result = await loadPersonalOverview(fixture('personal_tasks'), owner)
    expect(result.open).toBeNull()
    expect(result.completed).toBeNull()
    expect(result.tasks).toBeNull()
    expect(result.memories).toBe(1)
  })
})
