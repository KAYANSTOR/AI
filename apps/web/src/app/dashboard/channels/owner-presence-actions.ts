'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'
import { parseOwnerPresenceInput } from '@/lib/runtime/owner-presence-settings'

export type OwnerPresenceActionResult = { ok: boolean; error?: string; message?: string }

/** Owner/admin edits the sliding-pause settings of one WhatsApp channel. */
export async function saveOwnerPresenceSettingsAction(input: unknown): Promise<OwnerPresenceActionResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'الجلسة منتهية. سجّل الدخول من جديد.' }
  if (org.role !== 'owner' && org.role !== 'admin') {
    return { ok: false, error: 'صلاحية إدارة القنوات متاحة للمالك أو المسؤول فقط.' }
  }
  const parsed = parseOwnerPresenceInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const db = await createClient()
  const patch: Record<string, unknown> = {
    human_takeover_enabled: parsed.value.enabled,
    human_takeover_pause_minutes: parsed.value.pauseMinutes,
    human_takeover_scope: parsed.value.scope,
  }
  // Turning the feature off releases any running pause immediately.
  if (!parsed.value.enabled || parsed.value.scope === 'conversation') patch.human_paused_until = null
  const { data, error } = await db.from('channels').update(patch)
    .eq('id', parsed.value.channelId).eq('organization_id', org.organizationId).eq('channel_type', 'whatsapp')
    .select('id')
  if (error) return { ok: false, error: 'تعذّر حفظ الإعدادات. حاول مرة أخرى.' }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: 'القناة غير موجودة.' }
  revalidatePath('/dashboard/channels')
  return { ok: true, message: 'تم حفظ إعدادات تواجد صاحب النشاط.' }
}
