import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from './support/fake-supabase'
import { addOrganizationMember, listOrganizationMembers, updateMemberRole } from '@/lib/team'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000101'

function setup(rows: Record<string, unknown>[]) {
  const fake = createFakeSupabase({
    organization_members: { rows },
  })
  return { supabase: fake.client as unknown as SupabaseClient }
}

describe('team members', () => {
  test('owner can promote a member to admin, and member cannot', async () => {
    const { supabase } = setup([
      { id: 'm-owner', organization_id: ORG, user_id: 'u-owner', role: 'owner', is_active: true },
      { id: 'm-user', organization_id: ORG, user_id: 'u-user', role: 'member', is_active: true },
    ])

    const updated = await updateMemberRole(supabase, {
      organizationId: ORG,
      actorRole: 'owner',
      memberId: 'm-user',
      nextRole: 'admin',
    })

    expect(updated.role).toBe('admin')

    await expect(
      updateMemberRole(supabase, {
        organizationId: ORG,
        actorRole: 'member',
        memberId: 'm-owner',
        nextRole: 'member',
      })
    ).rejects.toThrow(/not authorized|authorization/i)
  })

  test('the last owner cannot be demoted and new members are validated', async () => {
    const { supabase } = setup([
      { id: 'm-owner', organization_id: ORG, user_id: 'u-owner', role: 'owner', is_active: true },
    ])

    await expect(
      updateMemberRole(supabase, {
        organizationId: ORG,
        actorRole: 'owner',
        memberId: 'm-owner',
        nextRole: 'member',
      })
    ).rejects.toThrow(/last owner|owner/i)

    await expect(
      addOrganizationMember(supabase, {
        organizationId: ORG,
        actorRole: 'owner',
        userId: 'u-new',
        role: 'super_admin',
      })
    ).rejects.toThrow(/invalid role/i)

    const members = await listOrganizationMembers(supabase, ORG)
    expect(members.length).toBe(1)
  })
})
