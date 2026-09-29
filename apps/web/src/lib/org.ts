import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export type OrgContext = {
  userId: string
  organizationId: string
  organizationName: string
  role: string
}

/**
 * Resolve the authenticated user's primary organization.
 * Phase 1 assumes one org per user (owner). Multi-org comes later.
 */
export const getCurrentOrg = cache(async (): Promise<OrgContext | null> => {
  // لا مزوّد مصادقة مُهيّأ بعد: لا توجد جلسة ممكنة، والمسار المحمي يعيد الزائر
  // إلى صفحة تسجيل الدخول بدل أن يسقط بخطأ مزوّد غير مضبوط.
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  const userId = typeof data?.claims.sub === 'string' ? data.claims.sub : null
  if (!userId) return null

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const org = membership.organizations as unknown as { name: string } | null

  return {
    userId,
    organizationId: membership.organization_id,
    organizationName: org?.name ?? '—',
    role: membership.role,
  }
})
