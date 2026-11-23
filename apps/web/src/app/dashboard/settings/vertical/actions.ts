'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'
import { getVertical, type VerticalLabels } from '@/lib/verticals/registry'

export async function updateVerticalConfigAction(input: {
  systemPrompt: string
  labels: Partial<VerticalLabels>
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const org = await getCurrentOrg()
    if (!org) return { ok: false, error: 'يلزم تسجيل الدخول.' }
    if (!['owner', 'admin'].includes(org.role)) return { ok: false, error: 'يلزم دور المالك أو المدير لتعديل إعدادات النشاط.' }

    const prompt = typeof input.systemPrompt === 'string' ? input.systemPrompt.trim() : ''
    if (prompt.length > 3000) return { ok: false, error: 'تعليمات النشاط تتجاوز الحد المسموح.' }
    const db = await createClient()
    const { data: current, error: readError } = await db.from('organizations')
      .select('business_type,vertical_config').eq('id', org.organizationId).maybeSingle()
    if (readError || !current) return { ok: false, error: 'تعذّر تحميل إعدادات النشاط.' }

    const vertical = getVertical(String(current.business_type ?? 'custom'))
    const allowedLabels = Object.keys(vertical.labels) as Array<keyof VerticalLabels>
    const labels: Partial<VerticalLabels> = {}
    for (const key of allowedLabels) {
      const value = input.labels?.[key]
      if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 80) {
        return { ok: false, error: 'يجب أن تكون كل تسمية بين حرف واحد و80 حرفاً.' }
      }
      labels[key] = value.trim()
    }
    const previous = (current.vertical_config ?? {}) as Record<string, unknown>
    const verticalConfig = {
      ...previous,
      baseEngine: vertical.baseEngine,
      enabledModules: vertical.enabledModules,
      enabledTools: vertical.enabledTools,
      requiredFields: vertical.requiredFields,
      kbTemplates: vertical.kbTemplates,
      systemPrompt: prompt || vertical.defaultSystemPrompt,
      labels: { ...vertical.labels, ...labels },
    }
    const { error: updateError } = await db.from('organizations').update({ vertical_config: verticalConfig }).eq('id', org.organizationId)
    if (updateError) return { ok: false, error: 'تعذّر حفظ إعدادات النشاط.' }
    revalidatePath('/dashboard/settings/vertical')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch {
    return { ok: false, error: 'تعذّر حفظ إعدادات النشاط.' }
  }
}
